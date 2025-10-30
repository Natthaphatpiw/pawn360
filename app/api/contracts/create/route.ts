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
      itemId,
      storeId,
      contractData,
    } = body;

    // Validation
    if (!itemId || !storeId || !contractData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const contractsCollection = db.collection<Contract>('contracts');
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');

    // Get item details
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Get customer details using lineId from item
    const customer = await customersCollection.findOne({ lineId: item.lineId });
    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Calculate dates and amounts - Always use current date for contract creation
    const startDate = new Date(); // Current date when contract is created

    // 🔥 ใช้ confirmationNewContract data ถ้ามี มิเช่นนั้นใช้ข้อมูลเดิม
    const pawnedPrice = item.confirmationNewContract?.pawnPrice || item.desiredAmount || item.estimatedValue || 0;
    const interestRate = item.confirmationNewContract?.interestRate || item.interestRate || 10;
    const periodDays = item.confirmationNewContract?.loanDays || item.loanDays || 30;

    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + periodDays);

    const totalInterest = (pawnedPrice * interestRate * periodDays) / (100 * 30);
    const remainingAmount = pawnedPrice + totalInterest;

    // Check if contract already exists for this item
    const existingContract = await contractsCollection.findOne({
      'item.itemId': new ObjectId(itemId)
    });

    if (existingContract) {
      console.log(`Contract already exists for item ${itemId}, updating instead of creating new one`);

      // Update existing contract with new data
      await contractsCollection.updateOne(
        { _id: existingContract._id },
        {
          $set: {
            'pawnDetails.pawnedPrice': pawnedPrice,
            'pawnDetails.interestRate': interestRate,
            'pawnDetails.periodDays': periodDays,
            'pawnDetails.totalInterest': totalInterest,
            'pawnDetails.remainingAmount': remainingAmount,
            'pawnDetails.serviceFee': contractData.serviceFee || 0,
            'dates.startDate': startDate,
            'dates.dueDate': dueDate,
            'signatures': contractData.signatures,
            'documents': existingContract.documents || {},
            status: 'active',
            updatedAt: new Date(),
          }
        }
      );

      // Update item with existing contract reference
      await itemsCollection.updateOne(
        { _id: new ObjectId(itemId) },
        {
          $set: {
            status: 'active',
            currentContractId: existingContract._id,
            storeId: new ObjectId(storeId),
            updatedAt: new Date(),
          },
          $addToSet: {
            contractHistory: existingContract._id as any,
          }
        }
      );

      // Update customer
      const currentCustomer = await customersCollection.findOne({ _id: customer._id });
      const storeIdToAdd = new ObjectId(storeId);

      if (!currentCustomer?.storeId) {
        await customersCollection.updateOne(
          { _id: customer._id },
          {
            $inc: {
              totalContracts: 1,
              totalValue: pawnedPrice,
            },
            $set: {
              lastContractDate: new Date(),
              updatedAt: new Date(),
              storeId: [storeIdToAdd],
            },
            $addToSet: {
              contractsID: existingContract._id as any,
            },
          }
        );
      } else if (Array.isArray(currentCustomer.storeId)) {
        await customersCollection.updateOne(
          { _id: customer._id },
          {
            $inc: {
              totalContracts: 1,
              totalValue: pawnedPrice,
            },
            $set: {
              lastContractDate: new Date(),
              updatedAt: new Date(),
            },
            $addToSet: {
              storeId: storeIdToAdd,
              contractsID: existingContract._id as any,
            },
          }
        );
      } else {
        await customersCollection.updateOne(
          { _id: customer._id },
          {
            $inc: {
              totalContracts: 1,
              totalValue: pawnedPrice,
            },
            $set: {
              lastContractDate: new Date(),
              updatedAt: new Date(),
              storeId: [currentCustomer.storeId, storeIdToAdd],
            },
            $addToSet: {
              contractsID: existingContract._id as any,
            },
          }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Contract updated successfully',
        contractId: existingContract._id,
        contractNumber: existingContract.contractNumber,
      });
    }

    // Upload contract images to S3 if provided
    const contractImageUrls: { contractHtmlUrl?: string; verificationPhotoUrl?: string } = {};

    // Generate contract number for new contract
    const contractNumber = `STORE${Date.now()}`;

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
        contractImageUrls.verificationPhotoUrl = `https://${process.env.AWS_S3_BUCKET_NAME || 'piwp360'}.s3.amazonaws.com/${photoKey}`;
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
        aiEstimatedPrice: item.estimatedValue || 0,
        pawnedPrice: pawnedPrice,
        interestRate: interestRate,
        periodDays: periodDays,
        totalInterest,
        remainingAmount,
        fineAmount: 0,
        payInterest: 0,
        soldAmount: 0,
        serviceFee: contractData.serviceFee || 0,
      },
      dates: {
        startDate,
        dueDate,
        redeemDate: null,
        suspendedDate: null,
      },
      transactionHistory: [],
      storeId: new ObjectId(storeId),
      createdBy: new ObjectId(storeId), // ใช้ storeId เป็น createdBy เพราะเป็นพนักงานร้าน
      userId: new ObjectId(storeId),
      // New fields for signatures and images
      signatures: contractData.signatures,
      documents: contractImageUrls,
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
      { _id: new ObjectId(itemId) },
      {
        $set: {
          status: 'active',
          currentContractId: result.insertedId,
          storeId: new ObjectId(storeId),
          updatedAt: new Date(),
        },
        $push: {
          contractHistory: result.insertedId as any,
        },
      }
    );

    // Update customer with contract info and storeId
    // First check if storeId is an array or single value and handle accordingly
    const currentCustomer = await customersCollection.findOne({ _id: customer._id });
    const storeIdToAdd = new ObjectId(storeId);

    if (!currentCustomer?.storeId) {
      // storeId doesn't exist, set it as an array
      await customersCollection.updateOne(
        { _id: customer._id },
        {
          $inc: {
            totalContracts: 1,
            totalValue: pawnedPrice,
          },
          $set: {
            lastContractDate: new Date(),
            updatedAt: new Date(),
            storeId: [storeIdToAdd],
          },
          $push: {
            contractsID: result.insertedId as any,
          },
        }
      );
    } else if (Array.isArray(currentCustomer.storeId)) {
      // storeId is already an array, add to it
      await customersCollection.updateOne(
        { _id: customer._id },
        {
          $inc: {
            totalContracts: 1,
            totalValue: pawnedPrice,
          },
          $set: {
            lastContractDate: new Date(),
            updatedAt: new Date(),
          },
          $addToSet: {
            storeId: storeIdToAdd,
          },
          $push: {
            contractsID: result.insertedId as any,
          },
        }
      );
    } else {
      // storeId exists as single ObjectId, convert to array
      await customersCollection.updateOne(
        { _id: customer._id },
        {
          $inc: {
            totalContracts: 1,
            totalValue: pawnedPrice,
          },
          $set: {
            lastContractDate: new Date(),
            updatedAt: new Date(),
            storeId: [currentCustomer.storeId, storeIdToAdd],
          },
          $push: {
            contractsID: result.insertedId as any,
          },
        }
      );
    }

    // Send notification to LINE
    try {
      const message = `สัญญาเลขที่ ${contractNumber} ของคุณได้ถูกสร้างเรียบร้อยแล้ว\n\nรายละเอียด:\n- สินค้า: ${item.brand} ${item.model}\n- จำนวนเงิน: ${pawnedPrice.toLocaleString()} บาท\n- อัตราดอกเบี้ย: ${interestRate}%\n- ระยะเวลา: ${periodDays} วัน\n- วันครบกำหนด: ${dueDate.toLocaleDateString('th-TH')}`;

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
