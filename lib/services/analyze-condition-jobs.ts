// Condition-scoring job queue — a thin wrapper over the generic JobQueue
// (lib/services/job-queue.ts). Mirrors lib/services/estimate-jobs.ts.

import { JobQueue, JobRecord, JobStatus } from '@/lib/services/job-queue';
import {
  AnalyzeConditionRequest,
  ConditionResult,
  runAnalyzeConditionPipeline,
} from '@/lib/services/analyze-condition-pipeline';

export type ConditionJobStatus = JobStatus;
export type ConditionJobRecord = JobRecord<AnalyzeConditionRequest, ConditionResult>;

const conditionJobQueue = new JobQueue<AnalyzeConditionRequest, ConditionResult>({
  namespace: 'condition:job:v1',
  processPath: '/api/analyze-condition/jobs/process',
  run: (request) => runAnalyzeConditionPipeline(request),
  timeoutMessage: 'การวิเคราะห์สภาพใช้เวลานานผิดปกติและถูกยกเลิก กรุณาลองใหม่อีกครั้ง',
});

export const isConditionJobStoreAvailable = () => conditionJobQueue.isStoreAvailable();
export const createConditionJob = (request: AnalyzeConditionRequest) => conditionJobQueue.create(request);
export const getConditionJob = (jobId: string) => conditionJobQueue.get(jobId);
export const cancelConditionJob = (jobId: string) => conditionJobQueue.cancel(jobId);
export const processConditionJob = (jobId: string) => conditionJobQueue.process(jobId);
export const getConditionJobDispatchMode = () => conditionJobQueue.getDispatchMode();
export const dispatchConditionJobViaQstash = (jobId: string) => conditionJobQueue.dispatchViaQstash(jobId);
export const getConditionJobWorkerSecret = () => conditionJobQueue.getWorkerSecret();
