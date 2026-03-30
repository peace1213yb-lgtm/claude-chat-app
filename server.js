const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Anthropic API Key
const API_KEY = process.env.ANTHROPIC_API_KEY;

const client = new Anthropic.default({
  apiKey: API_KEY,
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages is required and must be an array' });
    }

    const params = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: messages,
    };

    if (systemPrompt && systemPrompt.trim()) {
      params.system = systemPrompt.trim();
    }

    const response = await client.messages.create(params);

    const assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    res.json({
      role: 'assistant',
      content: assistantMessage,
    });
  } catch (error) {
    console.error('Anthropic API Error:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while communicating with Claude.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
