export const isKycNeedReview = (entity?: any) => {
  const ekycStatus = entity?.kyc_data?.application?.other_status?.ekyc
    || entity?.kyc_data?.extra?.ekyc?.face_compare?.status;
  return ekycStatus === 'need_review';
};

export const hasKycSubmissionCompleted = (entity?: any) => {
  const applicationStatus = entity?.kyc_data?.application?.status;
  const submittedAt = entity?.kyc_data?.application?.submitted_at;
  return applicationStatus === 'complete' || Boolean(submittedAt);
};

export const isKycPendingReviewState = (entity?: any) => (
  entity?.kyc_status === 'PENDING' && (
    isKycNeedReview(entity) || hasKycSubmissionCompleted(entity)
  )
);
