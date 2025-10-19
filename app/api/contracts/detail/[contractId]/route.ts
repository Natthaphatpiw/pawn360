import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await params;

    if (!contractId) {
      return NextResponse.json(
        { error: 'กรุณาระบุ contractId' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const contractsCollection = db.collection('contracts');
    const itemsCollection = db.collection('items');
    const customersCollection = db.collection('customers');
    const storesCollection = db.collection('stores');

    // Fetch contract
    const contract = await contractsCollection.findOne({ _id: new ObjectId(contractId) });

    if (!contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา' },
        { status: 404 }
      );
    }

    // Fetch related data
    const item = await itemsCollection.findOne({ _id: new ObjectId(contract.itemId) });
    const customer = await customersCollection.findOne({ lineId: contract.lineId });
    const store = await storesCollection.findOne({ _id: new ObjectId(contract.storeId) });

    if (!item) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลสินค้า' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      contract: {
        _id: contract._id,
        contractNumber: contract.contractNumber,
        lineId: contract.lineId,
        itemId: contract.itemId,
        storeId: contract.storeId,
        createdAt: contract.createdAt,
        status: contract.status || 'active'
      },
      item: {
        _id: item._id,
        brand: item.brand,
        model: item.model,
        type: item.type,
        serialNo: item.serialNo,
        desiredAmount: item.desiredAmount,
        estimatedValue: item.estimatedValue,
        interestRate: item.interestRate,
        loanDays: item.loanDays,
        accessories: item.accessories,
        defects: item.defects,
        note: item.note
      },
      customer: customer ? {
        fullName: customer.fullName,
        phone: customer.phone,
        idNumber: customer.idNumber
      } : null,
      store: store ? {
        storeName: store.storeName,
        phone: store.phone,
        address: store.address
      } : null
    });

  } catch (error) {
    console.error('Error fetching contract details:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' },
      { status: 500 }
    );
  }
}

