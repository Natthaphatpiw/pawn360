import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('drop_points')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('branch_name', { ascending: true });

    if (error) {
      console.error('Error fetching drop points:', error);
      return NextResponse.json(
        { error: 'Failed to fetch branches' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      branches: data || [],
    });
  } catch (error) {
    console.error('Error in drop-points API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
