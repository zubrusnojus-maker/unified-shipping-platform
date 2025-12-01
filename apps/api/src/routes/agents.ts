import { Router } from 'express';
import {
  enqueueCodeGenerationTask,
  getJobStatus,
  waitForJob,
  cancelJob,
  getQueueStats,
} from '@unified/agents-adapter';
import type { AgentTaskData } from '@unified/types';

const router = Router();

/**
 * POST /api/agents/generate
 * Enqueue a code generation task
 */
router.post('/generate', async (req, res) => {
  try {
    const taskData: AgentTaskData = req.body;
    const { wait = false, timeout = 300000 } = req.query;

    if (!taskData.taskDescription) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'taskDescription is required',
        },
      });
    }

    const jobId = await enqueueCodeGenerationTask(taskData, {
      priority: taskData.lane === 'p0' ? 1 : 10,
    });

    // If wait=true, wait for completion
    if (wait === 'true' || wait === true) {
      try {
        const result = await waitForJob(jobId, Number(timeout));
        res.json({
          success: true,
          data: {
            jobId,
            status: 'completed',
            result,
          },
        });
      } catch (error: any) {
        const status = await getJobStatus(jobId);
        res.json({
          success: false,
          data: {
            jobId,
            status: status.status,
            error: error.message,
          },
        });
      }
      return;
    }

    // Return immediately with job ID
    res.json({
      success: true,
      data: {
        jobId,
        status: 'queued',
        message: 'Code generation task queued successfully',
      },
    });
  } catch (error: any) {
    console.error('Generate error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GENERATE_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/agents/status/:jobId
 * Get the status of a code generation job
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const status = await getJobStatus(jobId);

    res.json({
      success: true,
      data: {
        jobId,
        ...status,
      },
    });
  } catch (error: any) {
    console.error('Status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * DELETE /api/agents/:jobId
 * Cancel a job
 */
router.delete('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    await cancelJob(jobId);

    res.json({
      success: true,
      data: {
        jobId,
        message: 'Job cancelled successfully',
      },
    });
  } catch (error: any) {
    console.error('Cancel error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/agents/stats
 * Get queue statistics
 */
router.get('/stats', async (_req, res) => {
  try {
    const stats = await getQueueStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: error.message,
      },
    });
  }
});

export { router as agentsRouter };
