<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$action = $_GET['action'] ?? '';

// -------------------
// Get verse
// -------------------
if($action === 'getVerse'){
    $ref = $_GET['ref'] ?? '';
    if(!$ref){ echo json_encode(['error'=>'No reference']); exit; }

    if(!preg_match('/([1-3]?\s?[A-Za-z]+)\s+(\d+):(\d+)/', $ref, $matches)){
        echo json_encode(['error'=>'Invalid reference format']); exit;
    }

    $book = strtolower(str_replace(' ', '-', $matches[1]));
    $chapter = $matches[2];
    $verse = $matches[3];

    $url = BIBLE_API_URL . "$book/chapters/$chapter/verses/$verse.json";
    $json = @file_get_contents($url);
    if(!$json){ echo json_encode(['error'=>'Verse not found']); exit; }

    $data = json_decode($json,true);
    $verseText = $data['text'] ?? '';
    echo json_encode(['passages'=>[$verseText]]);
    exit;
}

// -------------------
// Save sermon notes
// -------------------
if($action === 'saveNotes'){
    $notes = $_POST['notes'] ?? '';
    if(!$notes){ echo json_encode(['error'=>'No notes']); exit; }

    $filename = __DIR__ . '/../notes/sermon_'.time().'.txt';
    file_put_contents($filename, $notes);

    echo json_encode(['success'=>true,'file'=>$filename]);
    exit;
}
?>