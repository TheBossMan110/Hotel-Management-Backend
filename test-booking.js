// Quick test: Login + Create Booking + Check Profile
const API = 'http://localhost:5000/api';

async function test() {
  console.log('=== STEP 1: Login ===');
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'testflow@gmail.com', password: 'TestPass@123' })
  });
  const loginData = await loginRes.json();
  console.log('Login status:', loginRes.status);
  if (!loginData.accessToken) { console.log('LOGIN FAILED:', loginData); return; }
  console.log('User:', loginData.user?.firstName, loginData.user?.lastName);
  const token = loginData.accessToken;
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  // Get first available room
  console.log('\n=== STEP 2: Get a room ===');
  const roomsRes = await fetch(`${API}/rooms?limit=1`, { headers });
  const roomsData = await roomsRes.json();
  const room = roomsData.rooms?.[0];
  if (!room) { console.log('NO ROOMS FOUND'); return; }
  console.log('Room:', room.name, '| ID:', room._id, '| Price:', room.price?.basePrice);

  // Create booking
  console.log('\n=== STEP 3: Create Booking ===');
  const bookingRes = await fetch(`${API}/bookings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      roomId: room._id,
      checkIn: '2026-04-15',
      checkOut: '2026-04-17',
      guests: { adults: 1, children: 0 },
      paymentMethod: 'credit-card'
    })
  });
  const bookingData = await bookingRes.json();
  console.log('Booking status:', bookingRes.status);
  if (bookingRes.status !== 201) {
    console.log('BOOKING FAILED:', JSON.stringify(bookingData, null, 2));
    return;
  }
  console.log('Booking created! Number:', bookingData.booking?.bookingNumber);
  console.log('Room:', bookingData.booking?.room?.name);
  console.log('Total:', bookingData.booking?.pricing?.total);

  // Check my bookings
  console.log('\n=== STEP 4: Check My Bookings ===');
  const myBookingsRes = await fetch(`${API}/bookings/my-bookings`, { headers });
  const myBookingsData = await myBookingsRes.json();
  console.log('Total bookings:', myBookingsData.pagination?.total);
  myBookingsData.bookings?.forEach(b => {
    console.log(`  - ${b.room?.name || 'unknown'} | Status: ${b.status} | Total: ${b.pricing?.total}`);
  });

  // Check my invoices
  console.log('\n=== STEP 5: Check My Invoices ===');
  const invoicesRes = await fetch(`${API}/invoices/my-invoices`, { headers });
  const invoicesData = await invoicesRes.json();
  console.log('Total invoices:', invoicesData.invoices?.length || 0);
  invoicesData.invoices?.forEach(inv => {
    console.log(`  - ${inv.invoiceNumber} | Total: ${inv.summary?.total} | Status: ${inv.payment?.status}`);
  });

  console.log('\n=== ALL TESTS PASSED ===');
}

test().catch(e => console.error('Test error:', e.message));
