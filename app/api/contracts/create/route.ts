import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Contract } from '@/lib/db/models';
import { sendTextMessage } from '@/lib/line/client';
import { getS3Client } from '@/lib/aws/s3';
import { ObjectId } from 'mongodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      pawnRequestId,
      contractData,
    } = body;

    // Validation
    if (!pawnRequestId || !contractData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const contractsCollection = db.collection<Contract>('contracts');
    const pawnRequestsCollection = db.collection('pawnRequests');
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    // Get pawn request details
    const pawnRequest = await pawnRequestsCollection.findOne({ _id: new ObjectId(pawnRequestId) });
    if (!pawnRequest) {
      return NextResponse.json(
        { error: 'Pawn request not found' },
        { status: 404 }
      );
    }

    // Get item details using itemId from pawn request
    const item = await itemsCollection.findOne({ _id: new ObjectId(pawnRequest.itemId) });
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Get customer details using lineId from pawn request
    const customer = await customersCollection.findOne({ lineId: pawnRequest.lineId });
    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Calculate dates and amounts
    const startDate = new Date();
    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + pawnRequest.periodDays);

    const totalInterest = (pawnRequest.pawnedPrice * pawnRequest.interestRate * pawnRequest.periodDays) / (100 * 30);
    const remainingAmount = pawnRequest.pawnedPrice + totalInterest;

    // Generate contract number
    const contractNumber = `STORE${Date.now()}`;

    // Upload contract images to S3 if provided
    const contractImageUrls: { signedContract?: string; verificationPhoto?: string } = {};

    if (contractData.signatures?.seller?.signatureData || contractData.signatures?.buyer?.signatureData) {
      try {
        // Generate contract PDF/HTML and upload to S3
        // For now, we'll store the signature data in the contract
        // TODO: Generate proper PDF from contract data
      } catch (error) {
        console.error('Error uploading contract images:', error);
      }
    }

    if (contractData.verificationPhoto) {
      try {
        // Upload verification photo to S3
        const s3Client = getS3Client();
        const photoBuffer = Buffer.from(contractData.verificationPhoto.split(',')[1], 'base64');
        const photoFileName = `contract-${contractNumber}-verification.jpg`;
        const photoKey = `contracts/${photoFileName}`;

        const uploadCommand = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME || 'piwp360',
          Key: photoKey,
          Body: photoBuffer,
          ContentType: 'image/jpeg',
        });

        await s3Client.send(uploadCommand);
        contractImageUrls.verificationPhoto = `https://${process.env.AWS_S3_BUCKET_NAME || 'piwp360'}.s3.amazonaws.com/${photoKey}`;
      } catch (error) {
        console.error('Error uploading verification photo:', error);
      }
    }

    // Create contract
    const newContract: Contract = {
      contractNumber,
      status: 'active',
      customerId: customer._id,
      lineId: customer.lineId,
      item: {
        brand: item.brand,
        model: item.model,
        type: item.type,
        serialNo: item.serialNo,
        accessories: item.accessories,
        condition: item.condition,
        defects: item.defects,
        note: item.note,
        images: item.images,
      },
      pawnDetails: {
        aiEstimatedPrice: pawnRequest.estimatedValue || 0,
        pawnedPrice: pawnRequest.pawnedPrice,
        interestRate: pawnRequest.interestRate,
        periodDays: pawnRequest.periodDays,
        totalInterest,
        remainingAmount,
        fineAmount: 0,
        payInterest: 0,
        soldAmount: 0,
      },
      dates: {
        startDate,
        dueDate,
        redeemDate: null,
        suspendedDate: null,
      },
      transactionHistory: [],
      storeId: new ObjectId(pawnRequest.storeId),
      createdBy: new ObjectId(pawnRequest.createdBy || pawnRequest.storeId),
      userId: new ObjectId(pawnRequest.createdBy || pawnRequest.storeId),
      // New fields for signatures and images
      signatures: contractData.signatures,
      contractImages: contractImageUrls,
      serviceFee: contractData.serviceFee || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert contract
    const result = await contractsCollection.insertOne(newContract);

    if (!result.insertedId) {
      return NextResponse.json(
        { error: 'Failed to create contract' },
        { status: 500 }
      );
    }

    // Update item status and link to contract
    await itemsCollection.updateOne(
      { _id: new ObjectId(pawnRequest.itemId) },
      {
        $set: {
          status: 'active',
          currentContractId: result.insertedId,
          storeId: new ObjectId(pawnRequest.storeId),
          updatedAt: new Date(),
        },
        $push: {
          contractHistory: result.insertedId as any,
        },
      }
    );

    // Update customer with contract info and storeId
    await customersCollection.updateOne(
      { _id: customer._id },
      {
        $inc: {
          totalContracts: 1,
          totalValue: pawnRequest.pawnedPrice,
        },
        $set: {
          lastContractDate: new Date(),
          updatedAt: new Date(),
        },
        $addToSet: {
          storeId: new ObjectId(pawnRequest.storeId),
        },
        $push: {
          contractsID: result.insertedId as any,
        },
      }
    );

    // Update pawn request status
    await pawnRequestsCollection.updateOne(
      { _id: new ObjectId(pawnRequestId) },
      {
        $set: {
          status: 'completed',
          contractId: result.insertedId,
          updatedAt: new Date(),
        },
      }
    );

    // Send notification to LINE
    try {
      const message = `สัญญาเลขที่ ${contractNumber} ของคุณได้ถูกสร้างเรียบร้อยแล้ว\n\nรายละเอียด:\n- สินค้า: ${item.brand} ${item.model}\n- จำนวนเงิน: ${pawnRequest.pawnedPrice.toLocaleString()} บาท\n- อัตราดอกเบี้ย: ${pawnRequest.interestRate}%\n- ระยะเวลา: ${pawnRequest.periodDays} วัน\n- วันครบกำหนด: ${dueDate.toLocaleDateString('th-TH')}`;

      await sendTextMessage(customer.lineId, message);
    } catch (error) {
      console.error('Error sending notification:', error);
      // Continue even if notification fails
    }

    return NextResponse.json({
      success: true,
      contractId: result.insertedId,
      contractNumber,
      message: 'Contract created successfully',
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
