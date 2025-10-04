import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Customer } from '@/lib/db/models';
import { linkRichMenuToUser } from '@/lib/line/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      lineId,
      title,
      firstName,
      lastName,
      phone,
      idNumber,
      address,
    } = body;

    // Validation
    if (!lineId || !title || !firstName || !lastName || !phone || !idNumber || !address) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const customersCollection = db.collection<Customer>('customers');

    // Check if user already exists
    const existingCustomer = await customersCollection.findOne({ lineId });
    if (existingCustomer) {
      return NextResponse.json(
        { error: 'User already registered' },
        { status: 400 }
      );
    }

    // Create full name
    const fullName = `${title} ${firstName} ${lastName}`;

    // Create new customer
    const newCustomer: Customer = {
      lineId,
      title,
      firstName,
      lastName,
      fullName,
      phone,
      idNumber,
      address: {
        houseNumber: address.houseNumber,
        village: address.village,
        street: address.street,
        subDistrict: address.subDistrict,
        district: address.district,
        province: address.province,
        country: address.country || 'ประเทศไทย',
        postcode: address.postcode,
      },
      totalContracts: 0,
      totalValue: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      contractsID: [],
      pawnRequests: [],
    };

    // Insert into database
    const result = await customersCollection.insertOne(newCustomer);

    if (!result.insertedId) {
      return NextResponse.json(
        { error: 'Failed to create customer' },
        { status: 500 }
      );
    }

    // Link Rich Menu for members
    const richMenuIdForMembers = process.env.RICH_MENU_ID_MEMBER;
    if (richMenuIdForMembers) {
      try {
        await linkRichMenuToUser(lineId, richMenuIdForMembers);
      } catch (error) {
        console.error('Error linking rich menu:', error);
        // Continue even if rich menu linking fails
      }
    }

    return NextResponse.json({
      success: true,
      customerId: result.insertedId,
      message: 'Registration successful',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
