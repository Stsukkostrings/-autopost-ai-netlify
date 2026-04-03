async function generateCaption(title, description, hashtags) {
  if (!process.env.OPENAI_API_KEY) {
    return "";
  }

  const prompt = [
    `Write a short YouTube Shorts caption for this video title: ${title}`,
    description ? `Description context: ${description}` : "",
    hashtags.length ? `Include themes related to: ${hashtags.join(", ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
        max_output_tokens: 100
      })
    });

    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    return data.output_text || "";
  } catch (_error) {
    return "";
  }
}

module.exports = { generateCaption };
