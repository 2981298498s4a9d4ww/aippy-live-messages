const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const MESSAGE_EXPIRY_MS = 10 * 60 * 60 * 1000; // 10 hours
const COOLDOWN_MS = 60 * 1000; // 1 minute per IP
const MODERATION_API_KEY = "YOUR_MODERATION_API_KEY";
const MODERATION_API_URL = "https://api.someservice.com/moderate";

let messages = [];
let cooldowns = {};

function cleanAuthor(author) {
  if (!author || !author.trim()) return `Anonymous`;
  return author.trim();
}

function cleanText(text) {
  if (!text) return "";
  return text.trim().slice(0, 200);
}

function checkCooldown(ip) {
  const last = cooldowns[ip];
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function expireMessages() {
  const now = Date.now();
  messages = messages.filter(msg => now - msg.timestamp < MESSAGE_EXPIRY_MS);
}

app.post("/send", async (req, res) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  if (checkCooldown(ip)) return res.status(429).json({ error: "Wait 1 minute before sending again." });

  let { author, text } = req.body;
  author = cleanAuthor(author);
  text = cleanText(text);
  if (!text) return res.status(400).json({ error: "Message cannot be empty." });

  try {
    const response = await fetch(MODERATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MODERATION_API_KEY}` },
      body: JSON.stringify({ text })
    });
    const result = await response.json();
    if (result.isBad) return res.status(400).json({ error: "Message contains inappropriate content." });
  } catch (err) {
    console.error("Moderation API error:", err);
    return res.status(500).json({ error: "Censorship service unavailable." });
  }

  const message = { id: messages.length + 1, author, text, timestamp: Date.now(), ip };
  messages.push(message);
  cooldowns[ip] = Date.now();
  expireMessages();
  res.json({ success: true, message });
});

app.get("/latest", (req, res) => {
  expireMessages();
  res.json(messages.slice(-20).reverse());
});

app.get("/random", (req, res) => {
  expireMessages();
  if (messages.length === 0) return res.json({ message: null });
  const random = messages[Math.floor(Math.random() * messages.length)];
  res.json(random);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live message server running on port ${PORT}`));
