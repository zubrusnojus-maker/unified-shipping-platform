import { Router, type IRouter } from 'express';
import { createChatbot, HuggingFaceProvider } from '@unified/chatbot';

const router: IRouter = Router();

// Initialize chatbot lazily (shared with chat router in real implementation)
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
 * GET /api/memories/:userId
 * Get all memories for a user
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const bot = getChatbot();
    const memories = await bot.getMemories(userId);

    res.json({
      success: true,
      data: {
        results: memories,
        count: memories.length,
      },
    });
  } catch (error: any) {
    console.error('Get memories error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMORIES_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * DELETE /api/memories/:userId
 * Clear all memories for a user
 */
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const bot = getChatbot();
    await bot.clearMemories(userId);

    res.json({
      success: true,
      data: {
        message: 'Memories cleared successfully',
      },
    });
  } catch (error: any) {
    console.error('Clear memories error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CLEAR_MEMORIES_ERROR',
        message: error.message,
      },
    });
  }
});

export { router as memoriesRouter };
