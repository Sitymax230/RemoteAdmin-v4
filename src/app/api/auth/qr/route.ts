import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { uri } = await request.json();
    if (!uri) {
      return NextResponse.json({ error: 'URI is required' }, { status: 400 });
    }

    const QRCode = await import('qrcode');
    const dataUrl = await QRCode.toDataURL(uri, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    return NextResponse.json({ qr: dataUrl });
  } catch (error) {
    console.error('QR generation error:', error);
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 });
  }
}
