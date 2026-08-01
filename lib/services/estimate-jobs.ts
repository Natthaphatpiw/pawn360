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
  vercelTopic: (request) => request.itemType === 'โน้ตบุค'
    ? 'pawnline-estimate-notebook-v1'
    : 'pawnline-estimate-generic-v1',
  concurrency: (request) => request.itemType === 'โน้ตบุค'
    ? {
        group: 'estimate-notebook',
        defaultLimit: 2,
        envVar: 'JOB_CONCURRENCY_ESTIMATE_NOTEBOOK',
      }
    : {
        group: 'estimate-generic',
        defaultLimit: 6,
        envVar: 'JOB_CONCURRENCY_ESTIMATE_GENERIC',
      },
  timeoutMessage: 'การประเมินใช้เวลานานผิดปกติและถูกยกเลิก กรุณาลองใหม่อีกครั้ง',
  legacyDispatcherEnv: 'ESTIMATE_JOB_DISPATCHER',
  legacyWorkerSecretEnv: 'ESTIMATE_JOB_WORKER_SECRET',
});

export const estimateJobs = estimateJobQueue;

export const isEstimateJobStoreAvailable = () => estimateJobQueue.isStoreAvailable();
export const createEstimateJob = (request: EstimateRequest, idempotencyKey?: string) =>
  estimateJobQueue.create(request, idempotencyKey);
export const getEstimateJob = (jobId: string) => estimateJobQueue.get(jobId);
export const cancelEstimateJob = (jobId: string) => estimateJobQueue.cancel(jobId);
export const processEstimateJob = (
  jobId: string,
  options?: Parameters<typeof estimateJobQueue.process>[1]
) => estimateJobQueue.process(jobId, options);
export const getEstimateJobDispatchMode = () => estimateJobQueue.getDispatchMode();
export const dispatchEstimateJobViaQstash = (jobId: string) => estimateJobQueue.dispatchViaQstash(jobId);
export const dispatchEstimateJobViaVercel = (jobId: string, request: EstimateRequest) =>
  estimateJobQueue.dispatchViaVercel(jobId, request);
export const failEstimateJobDispatch = (jobId: string) => estimateJobQueue.failDispatch(jobId);
export const getEstimateJobWorkerSecret = () => estimateJobQueue.getWorkerSecret();
