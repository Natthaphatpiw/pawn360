'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, Clock, CheckCircle, X, AlertTriangle } from 'lucide-react';
import axios from 'axios';

export default function PrincipalIncreaseWaitingPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const requestId = searchParams.get('requestId');

  const [loading, setLoading] = useState(true);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [status, setStatus] = useState<string>('PENDING_INVESTOR_APPROVAL');

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails();
      // Poll for status updates every 10 seconds
      const interval = setInterval(fetchRequestDetails, 10000);
      return () => clearInterval(interval);
    }
  }, [requestId]);

  const fetchRequestDetails = async () => {
    try {
      const response = await axios.get(`/api/contract-actions/${requestId}`);
      if (response.data.success) {
        setRequestDetails(response.data.request);
        setStatus(response.data.request.request_status);
      }
    } catch (error) {
      console.error('Error fetching request:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToContracts = () => {
    router.push('/contracts');
  };

  const handleConfirmReceived = async () => {
    try {
      const response = await axios.post('/api/contract-actions/confirm-received', {
        requestId,
      });

      if (response.data.success) {
        fetchRequestDetails();
      }
    } catch (error) {
      console.error('Error confirming:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B85C38]"></div>
      </div>
    );
  }

  const contract = requestDetails?.contract;
  const item = contract?.items;

  // Show different states based on status
  if (status === 'INVESTOR_REJECTED') {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">คำขอถูกปฏิเสธ</h1>
          <p className="text-gray-500 text-sm mb-6">
            นักลงทุนได้ปฏิเสธคำขอเพิ่มเงินต้นของคุณ
          </p>

          {requestDetails?.rejection_reason && (
            <div className="bg-red-50 rounded-2xl p-4 mb-6 text-left">
              <p className="text-sm text-red-700">
                <span className="font-bold">เหตุผล:</span> {requestDetails.rejection_reason}
              </p>
            </div>
          )}

          <button
            onClick={handleGoToContracts}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (status === 'COMPLETED') {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">เพิ่มเงินต้นสำเร็จ</h1>
          <p className="text-gray-500 text-sm mb-6">
            เงินต้นของสัญญาได้รับการเพิ่มเรียบร้อยแล้ว
          </p>

          {contract && (
            <div className="bg-[#FFF8F5] rounded-2xl p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">เลขที่สัญญา:</span>
                  <span className="font-bold">{contract.contract_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">เงินต้นใหม่:</span>
                  <span className="font-bold text-[#B85C38]">
                    {requestDetails.new_principal_amount?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">เพิ่มขึ้น:</span>
                  <span className="font-bold text-green-600">
                    + {requestDetails.increase_amount?.toLocaleString()} บาท
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleGoToContracts}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (status === 'INVESTOR_TRANSFERRED') {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">นักลงทุนโอนเงินแล้ว</h1>
          <p className="text-gray-500 text-sm mb-6">
            กรุณาตรวจสอบบัญชีของคุณและยืนยันการได้รับเงิน
          </p>

          {requestDetails && (
            <div className="bg-[#FFF8F5] rounded-2xl p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">จำนวนเงิน:</span>
                  <span className="font-bold text-[#B85C38]">
                    {requestDetails.increase_amount?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">โอนเข้าบัญชี:</span>
                  <span className="font-bold">
                    {requestDetails.pawner_bank_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">เลขบัญชี:</span>
                  <span className="font-bold">
                    {requestDetails.pawner_bank_account_no}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleConfirmReceived}
            className="w-full bg-green-500 hover:bg-green-600 text-white rounded-2xl py-4 font-bold transition-colors mb-3"
          >
            ยืนยันได้รับเงินแล้ว
          </button>

          <button
            onClick={handleGoToContracts}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl py-3 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  if (status === 'AWAITING_PAYMENT' || status === 'SLIP_REJECTED') {
    return (
      <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-amber-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">รออัปโหลดสลิปดอกเบี้ย</h1>
          <p className="text-gray-500 text-sm mb-6">
            กรุณาอัปโหลดสลิปการชำระดอกเบี้ยเพื่อให้ระบบส่งคำขอไปยังนักลงทุน
          </p>

          <button
            onClick={() => router.push(`/contracts/${contractId}/principal-increase/upload?requestId=${requestId}`)}
            className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-4 font-bold transition-colors mb-3"
          >
            อัปโหลดสลิป
          </button>

          <button
            onClick={handleGoToContracts}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl py-3 font-medium transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    );
  }

  // Default: Waiting for investor approval
  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">รอการอนุมัติ</h1>
          <p className="text-xs text-gray-400">Waiting for Approval</p>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg max-w-sm w-full">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-2">รอนักลงทุนอนุมัติ</h1>
          <p className="text-gray-500 text-sm mb-6">
            คำขอเพิ่มเงินต้นของคุณถูกส่งไปยังนักลงทุนแล้ว<br />
            กรุณารอการพิจารณา
          </p>

          {requestDetails && (
            <div className="bg-[#FFF8F5] rounded-2xl p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">รายการ:</span>
                  <span className="font-bold">{item?.brand} {item?.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">จำนวนที่ขอเพิ่ม:</span>
                  <span className="font-bold text-[#B85C38]">
                    {requestDetails.increase_amount?.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">สถานะ:</span>
                  <span className="font-bold text-amber-600">
                    รอการอนุมัติ
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
              <span className="text-sm">กำลังรอการตอบกลับ...</span>
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-3 mb-6">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 text-left">
                หน้านี้จะอัปเดตอัตโนมัติเมื่อนักลงทุนตอบกลับ
                คุณสามารถกลับมาตรวจสอบสถานะได้ทุกเมื่อ
              </p>
            </div>
          </div>

          <button
            onClick={handleGoToContracts}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl py-4 font-bold transition-colors"
          >
            กลับหน้าสัญญา
          </button>
        </div>
      </div>
    </div>
  );
}
