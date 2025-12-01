import { Router } from 'express';
import { createChatbot, HuggingFaceProvider } from '@unified/chatbot';

const router = Router();

// Initialize chatbot lazily
let chatbot: ReturnType<typeof createChatbot> | null = null;

function getChatbot() {
  if (!chatbot) {
    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      throw new Error('HF_TOKEN environment variable is required');
    }

    const llmProvider = new HuggingFaceProvider({
      apiKey: hfToken,
      model: process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2',
    });

    chatbot = createChatbot({ llmProvider });
  }

  return chatbot;
}

/**
 * POST /api/chat
 * Send a message to the chatbot
 */
router.post('/', async (req, res) => {
  try {
    const { message, userId, conversationId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'message and userId are required',
        },
      });
    }

    const bot = getChatbot();
    const response = await bot.chat(message, userId, conversationId);

    res.json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHAT_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/chat/history/:userId
 * Get conversation history for a user
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const bot = getChatbot();
    const history = await bot.getHistory(userId);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'HISTORY_ERROR',
        message: error.message,
      },
    });
  }
});

export { router as chatRouter };
