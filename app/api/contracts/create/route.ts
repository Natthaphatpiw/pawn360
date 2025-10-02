import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/mongodb';
import { Contract } from '@/lib/db/models';
import { sendTextMessage } from '@/lib/line/client';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      itemId,
      customerId,
      storeId,
      createdBy,
      pawnedPrice,
      interestRate,
      periodDays,
      aiEstimatedPrice,
    } = body;

    // Validation
    if (!itemId || !customerId || !storeId || !createdBy || !pawnedPrice || !interestRate || !periodDays) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
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

    // Get customer details
    const customer = await customersCollection.findOne({ _id: new ObjectId(customerId) });
    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Calculate dates and amounts
    const startDate = new Date();
    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + periodDays);

    const totalInterest = (pawnedPrice * interestRate * periodDays) / (100 * 30);
    const remainingAmount = pawnedPrice + totalInterest;

    // Generate contract number
    const contractNumber = `STORE${Date.now()}`;

    // Create contract
    const newContract: Contract = {
      contractNumber,
      status: 'active',
      customerId: new ObjectId(customerId),
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
        aiEstimatedPrice: aiEstimatedPrice || 0,
        pawnedPrice,
        interestRate,
        periodDays,
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
      storeId: new ObjectId(storeId),
      createdBy: new ObjectId(createdBy),
      userId: new ObjectId(createdBy),
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
    await customersCollection.updateOne(
      { _id: new ObjectId(customerId) },
      {
        $inc: {
          totalContracts: 1,
          totalValue: pawnedPrice,
        },
        $set: {
          lastContractDate: new Date(),
          storeId: new ObjectId(storeId),
          updatedAt: new Date(),
        },
        $push: {
          contractsID: result.insertedId as any,
        },
      }
    );

    // Update pawn request status in customer document
    await customersCollection.updateOne(
      {
        _id: new ObjectId(customerId),
        'pawnRequests.itemId': new ObjectId(itemId)
      },
      {
        $set: {
          'pawnRequests.$.status': 'completed',
        },
      }
    );

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
