// Estimate job queue — a thin wrapper over the generic JobQueue
// (lib/services/job-queue.ts). See ESTIMATE_JOB_QUEUE.md.

import {
  JobQueue,
  JobRecord,
  JobStatus,
} from '@/lib/services/job-queue';
import {
  EstimateRequest,
  EstimateResponse,
  runEstimatePipeline,
} from '@/lib/services/estimate-pipeline';

export type EstimateJobStatus = JobStatus;
export type EstimateJobRecord = JobRecord<EstimateRequest, EstimateResponse>;

const estimateJobQueue = new JobQueue<EstimateRequest, EstimateResponse>({
  namespace: 'estimate:job:v1',
  processPath: '/api/estimate/jobs/process',
  run: (request) => runEstimatePipeline(request),
  getLineId: (request) => request.lineId,
  timeoutMessage: 'การประเมินใช้เวลานานผิดปกติและถูกยกเลิก กรุณาลองใหม่อีกครั้ง',
  legacyDispatcherEnv: 'ESTIMATE_JOB_DISPATCHER',
  legacyWorkerSecretEnv: 'ESTIMATE_JOB_WORKER_SECRET',
});

export const estimateJobs = estimateJobQueue;

export const isEstimateJobStoreAvailable = () => estimateJobQueue.isStoreAvailable();
export const createEstimateJob = (request: EstimateRequest) => estimateJobQueue.create(request);
export const getEstimateJob = (jobId: string) => estimateJobQueue.get(jobId);
export const cancelEstimateJob = (jobId: string) => estimateJobQueue.cancel(jobId);
export const processEstimateJob = (jobId: string) => estimateJobQueue.process(jobId);
export const getEstimateJobDispatchMode = () => estimateJobQueue.getDispatchMode();
export const dispatchEstimateJobViaQstash = (jobId: string) => estimateJobQueue.dispatchViaQstash(jobId);
export const getEstimateJobWorkerSecret = () => estimateJobQueue.getWorkerSecret();
