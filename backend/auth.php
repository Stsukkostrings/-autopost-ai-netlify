<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config.php';

const USERS_FILE = __DIR__ . '/data/users.json';
const PENDING_FILE = __DIR__ . '/data/pending_verifications.json';

$action = $_GET['action'] ?? '';
$payload = read_json_input();

switch ($action) {
    case 'register-start':
        handle_register_start($payload);
        break;
    case 'verify-email':
        handle_verify_email($payload);
        break;
    case 'resend-verification':
        handle_resend_verification($payload);
        break;
    case 'login':
        handle_login($payload);
        break;
    default:
        respond_error('Unknown action.', 404);
}

function handle_register_start($payload) {
    $fullName = trim((string) ($payload['fullName'] ?? ''));
    $email = normalize_email($payload['email'] ?? '');
    $password = (string) ($payload['password'] ?? '');

    if ($fullName === '' || $email === '' || $password === '') {
        respond_error('Full name, email, and password are required.');
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond_error('Enter a valid email address.');
    }

    if (strlen($password) < 6) {
        respond_error('Password must be at least 6 characters.');
    }

    $users = load_json_file(USERS_FILE);
    foreach ($users as $user) {
        if (normalize_email($user['email'] ?? '') === $email) {
            respond_error('An account already exists for this email.');
        }
    }

    $pending = load_json_file(PENDING_FILE);
    $code = generate_verification_code();
    $now = gmdate('c');
    $expiresAt = gmdate('c', time() + (AUTH_CODE_TTL_MINUTES * 60));

    $pending[$email] = [
        'fullName' => $fullName,
        'email' => $email,
        'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
        'codeHash' => hash_code($code),
        'createdAt' => $pending[$email]['createdAt'] ?? $now,
        'updatedAt' => $now,
        'expiresAt' => $expiresAt
    ];

    save_json_file(PENDING_FILE, $pending);

    if (!send_verification_email($email, $fullName, $code)) {
        respond_error('Unable to send verification email right now. Check your mail server configuration and try again.', 500);
    }

    respond_success([
        'pendingVerification' => true,
        'email' => $email,
        'expiresAt' => $expiresAt,
        'message' => 'A verification code has been sent to your email address.'
    ]);
}

function handle_verify_email($payload) {
    $email = normalize_email($payload['email'] ?? '');
    $code = preg_replace('/\D+/', '', (string) ($payload['code'] ?? ''));

    if ($email === '' || $code === '') {
        respond_error('Email and verification code are required.');
    }

    $pending = load_json_file(PENDING_FILE);
    $entry = $pending[$email] ?? null;
    if (!$entry) {
        respond_error('No pending verification was found for this email.');
    }

    if (strtotime($entry['expiresAt'] ?? '') < time()) {
        unset($pending[$email]);
        save_json_file(PENDING_FILE, $pending);
        respond_error('This verification code has expired. Request a new code and try again.');
    }

    if (!hash_equals((string) ($entry['codeHash'] ?? ''), hash_code($code))) {
        respond_error('The verification code is invalid.');
    }

    $users = load_json_file(USERS_FILE);
    foreach ($users as $user) {
        if (normalize_email($user['email'] ?? '') === $email) {
            unset($pending[$email]);
            save_json_file(PENDING_FILE, $pending);
            respond_error('An account already exists for this email.');
        }
    }

    $user = [
        'id' => generate_user_id(),
        'fullName' => (string) ($entry['fullName'] ?? ''),
        'email' => $email,
        'passwordHash' => (string) ($entry['passwordHash'] ?? ''),
        'createdAt' => (string) ($entry['createdAt'] ?? gmdate('c')),
        'verifiedAt' => gmdate('c')
    ];

    $users[] = $user;
    save_json_file(USERS_FILE, $users);

    unset($pending[$email]);
    save_json_file(PENDING_FILE, $pending);

    respond_success([
        'user' => public_user($user)
    ]);
}

function handle_resend_verification($payload) {
    $email = normalize_email($payload['email'] ?? '');
    if ($email === '') {
        respond_error('Email is required.');
    }

    $pending = load_json_file(PENDING_FILE);
    $entry = $pending[$email] ?? null;
    if (!$entry) {
        respond_error('No pending verification was found for this email.');
    }

    $code = generate_verification_code();
    $entry['codeHash'] = hash_code($code);
    $entry['updatedAt'] = gmdate('c');
    $entry['expiresAt'] = gmdate('c', time() + (AUTH_CODE_TTL_MINUTES * 60));
    $pending[$email] = $entry;
    save_json_file(PENDING_FILE, $pending);

    if (!send_verification_email($email, (string) ($entry['fullName'] ?? ''), $code)) {
        respond_error('Unable to resend verification email right now. Check your mail server configuration and try again.', 500);
    }

    respond_success([
        'pendingVerification' => true,
        'email' => $email,
        'expiresAt' => $entry['expiresAt'],
        'message' => 'A new verification code has been sent.'
    ]);
}

function handle_login($payload) {
    $email = normalize_email($payload['email'] ?? '');
    $password = (string) ($payload['password'] ?? '');

    if ($email === '' || $password === '') {
        respond_error('Email and password are required.');
    }

    $users = load_json_file(USERS_FILE);
    foreach ($users as $user) {
        if (normalize_email($user['email'] ?? '') !== $email) {
            continue;
        }

        if (!password_verify($password, (string) ($user['passwordHash'] ?? ''))) {
            respond_error('Invalid email or password.', 401);
        }

        respond_success([
            'user' => public_user($user)
        ]);
    }

    $pending = load_json_file(PENDING_FILE);
    if (isset($pending[$email])) {
        respond_error('Your account has not been verified yet. Enter the code sent to your email.', 403, [
            'pendingVerification' => true,
            'email' => $email
        ]);
    }

    respond_error('Invalid email or password.', 401);
}

function read_json_input() {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function normalize_email($email) {
    return strtolower(trim((string) $email));
}

function generate_verification_code() {
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function generate_user_id() {
    return (int) round(microtime(true) * 1000) + random_int(10, 999);
}

function hash_code($code) {
    return hash('sha256', trim((string) $code));
}

function public_user($user) {
    return [
        'id' => $user['id'],
        'fullName' => $user['fullName'],
        'email' => $user['email'],
        'createdAt' => $user['createdAt'] ?? null,
        'verifiedAt' => $user['verifiedAt'] ?? null
    ];
}

function ensure_storage($path) {
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    if (!file_exists($path)) {
        file_put_contents($path, json_encode([], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }
}

function load_json_file($path) {
    ensure_storage($path);
    $data = file_get_contents($path);
    $decoded = json_decode($data ?: '[]', true);
    return is_array($decoded) ? $decoded : [];
}

function save_json_file($path, $payload) {
    ensure_storage($path);
    file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function send_verification_email($email, $fullName, $code) {
    $safeName = trim($fullName) !== '' ? trim($fullName) : 'there';
    $subject = 'Your AI Church Broadcast verification code';
    $message = "Hello {$safeName},\r\n\r\n"
        . "Use this verification code to finish creating your AI Church Broadcast account:\r\n\r\n"
        . "{$code}\r\n\r\n"
        . "This code expires in " . AUTH_CODE_TTL_MINUTES . " minutes.\r\n\r\n"
        . "If you did not request this code, you can ignore this email.\r\n";

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'From: ' . MAIL_FROM_NAME . ' <' . MAIL_FROM_ADDRESS . '>'
    ];

    return @mail($email, $subject, $message, implode("\r\n", $headers));
}

function respond_success($payload = [], $status = 200) {
    http_response_code($status);
    echo json_encode(array_merge(['success' => true], $payload));
    exit;
}

function respond_error($message, $status = 400, $extra = []) {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => false,
        'error' => $message
    ], $extra));
    exit;
}
