import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Core models
import User from './models/User.js';
import Room from './models/Room.js';
import Booking from './models/Booking.js';
import Invoice from './models/Invoice.js';
import Feedback from './models/Feedback.js';
import Task from './models/Task.js';
import Settings from './models/Settings.js';

// Extended models
import StaffProfile from './models/StaffProfile.js';
import GuestProfile from './models/GuestProfile.js';
import ServiceRequest from './models/ServiceRequest.js';
import MaintenanceRequest from './models/MaintenanceRequest.js';
import Notification from './models/Notification.js';
import Service from './models/Service.js';
import Department from './models/Department.js';
import ChatLog from './models/ChatLog.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel_management';

const seedDatabase = async () => {
  console.log('🚀 Starting seed script...');
  try {
    console.log(`🔗 Connecting to MongoDB at ${MONGODB_URI}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ─── Clear ALL collections ───────────────────────────────────────────────
    await Promise.all([
      User.deleteMany({}),
      Room.deleteMany({}),
      Booking.deleteMany({}),
      Invoice.deleteMany({}),
      Feedback.deleteMany({}),
      Task.deleteMany({}),
      Settings.deleteMany({}),
      StaffProfile.deleteMany({}),
      GuestProfile.deleteMany({}),
      ServiceRequest.deleteMany({}),
      MaintenanceRequest.deleteMany({}),
      Notification.deleteMany({}),
      Service.deleteMany({}),
      Department.deleteMany({}),
      ChatLog.deleteMany({})
    ]);
    console.log('🗑️  Cleared all existing data');

    // Drop stale indexes that may have been left from old schema versions
    try {
      const bookingCollection = mongoose.connection.collection('bookings');
      const indexes = await bookingCollection.indexes();
      for (const idx of indexes) {
        if (idx.name !== '_id_' && (idx.key.bookingReference !== undefined || idx.key.roomNumber !== undefined)) {
          await bookingCollection.dropIndex(idx.name);
          console.log(`  🗑️  Dropped stale index: ${idx.name}`);
        }
      }
    } catch (e) {
      // Collection may not exist yet, that's ok
    }
    console.log('🧹 Index cleanup complete');

    // ─── ADMIN user ──────────────────────────────────────────────────────────
    const admin = await User.create({
      email: 'admin@hotel.com',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      phone: '+923001234567'
    });
    console.log('👤 Created admin: admin@hotel.com / admin123');

    // ─── STAFF users + StaffProfile ──────────────────────────────────────────
    const staffData = [
      {
        email: 'housekeeping@grandazure.pk',
        firstName: 'Zahid',
        lastName: 'Ahmed',
        phone: '+923011111111',
        profile: {
          department: 'housekeeping',
          position: 'Supervisor',
          shift: 'morning',
          skills: ['Deep cleaning', 'Staff training', 'Inventory management'],
          isOnDuty: true
        }
      },
      {
        email: 'frontdesk@grandazure.pk',
        firstName: 'Farrah',
        lastName: 'Khan',
        phone: '+923022222222',
        profile: {
          department: 'frontdesk',
          position: 'Receptionist',
          shift: 'evening',
          skills: ['Guest relations', 'PMS expert', 'Multilingual'],
          isOnDuty: true
        }
      },
      {
        email: 'maintenance@grandazure.pk',
        firstName: 'Irfan',
        lastName: 'Malik',
        phone: '+923033333333',
        profile: {
          department: 'maintenance',
          position: 'Technician',
          shift: 'morning',
          skills: ['Electrical', 'HVAC', 'Plumbing'],
          isOnDuty: false
        }
      },
      {
        email: 'manager@grandazure.pk',
        firstName: 'Suleman',
        lastName: 'Raza',
        phone: '+923044444444',
        profile: {
          department: 'management',
          position: 'General Manager',
          shift: 'flexible',
          skills: ['Hospitality management', 'Operations', 'Strategic planning'],
          isOnDuty: true,
          performanceRating: 5
        }
      }
    ];

    const staffUsers = [];
    for (const s of staffData) {
      const user = await User.create({
        email: s.email,
        password: 'staff123',
        firstName: s.firstName,
        lastName: s.lastName,
        role: 'staff',
        phone: s.phone
      });

      await StaffProfile.create({
        userId: user._id,
        department: s.profile.department,
        position: s.profile.position,
        shift: s.profile.shift,
        hireDate: new Date('2023-01-01'),
        salary: { amount: 85000, currency: 'PKR', paymentFrequency: 'monthly' },
        emergencyContact: { name: 'Family Contact', phone: '+923999999999', relationship: 'Parent' },
        skills: s.profile.skills,
        isOnDuty: s.profile.isOnDuty,
        leaveBalance: 20,
        performanceRating: s.profile.performanceRating || 4
      });

      staffUsers.push(user);
    }
    console.log(`👷 Created ${staffUsers.length} staff users`);

    // ─── GUEST users + GuestProfile ──────────────────────────────────────────
    const guestData = [
      {
        email: 'ahmed.khan@email.pk',
        firstName: 'Ahmed',
        lastName: 'Khan',
        phone: '+923331234567',
        profile: {
          nationality: 'Pakistani',
          loyaltyPoints: 1500,
          membershipTier: 'gold',
          vipStatus: true,
          preferences: { roomType: 'deluxe', bedType: 'king', floorPreference: 'High floor' }
        }
      },
      {
        email: 'fatima.ali@email.pk',
        firstName: 'Fatima',
        lastName: 'Ali',
        phone: '+923457654321',
        profile: {
          nationality: 'Pakistani',
          loyaltyPoints: 500,
          membershipTier: 'silver',
          preferences: { roomType: 'suite', bedType: 'king', floorPreference: 'Quiet area' }
        }
      },
      {
        email: 'omar.hussain@email.pk',
        firstName: 'Omar',
        lastName: 'Hussain',
        phone: '+923551234567',
        profile: {
          nationality: 'Pakistani',
          loyaltyPoints: 200,
          membershipTier: 'bronze',
          preferences: { roomType: 'standard', bedType: 'double', floorPreference: 'Low floor' }
        }
      }
    ];

    const guestUsers = [];
    for (const g of guestData) {
      const user = await User.create({
        email: g.email,
        password: 'guest123',
        firstName: g.firstName,
        lastName: g.lastName,
        role: 'guest',
        phone: g.phone,
        loyaltyPoints: g.profile.loyaltyPoints,
        membershipTier: g.profile.membershipTier
      });

      await GuestProfile.create({
        userId: user._id,
        nationality: g.profile.nationality,
        loyaltyPoints: g.profile.loyaltyPoints,
        membershipTier: g.profile.membershipTier,
        vipStatus: g.profile.vipStatus || false,
        preferences: g.profile.preferences,
        totalVisits: 2,
        totalSpent: g.profile.loyaltyPoints * 10
      });

      guestUsers.push(user);
    }
    console.log(`🛎️  Created ${guestUsers.length} guest users`);

    // ─── DEPARTMENTS ─────────────────────────────────────────────────────────
    await Department.insertMany([
      { name: 'housekeeping', displayName: 'Housekeeping', description: 'Room cleaning and laundry services', manager: staffUsers[0]._id, color: '#8b5cf6', icon: 'sparkles' },
      { name: 'maintenance', displayName: 'Maintenance', description: 'Building and equipment maintenance', manager: staffUsers[2]._id, color: '#f59e0b', icon: 'wrench' },
      { name: 'frontdesk', displayName: 'Front Desk', description: 'Guest check-in/out and inquiries', manager: staffUsers[1]._id, color: '#3b82f6', icon: 'user-check' },
      { name: 'management', displayName: 'Management', description: 'Hotel operations and strategy', manager: staffUsers[3]._id, color: '#10b981', icon: 'briefcase' },
      { name: 'restaurant', displayName: 'Restaurant', description: 'Food and beverage service', color: '#ec4899', icon: 'utensils' },
      { name: 'security', displayName: 'Security', description: 'Guest and property safety', color: '#6b7280', icon: 'shield' },
      { name: 'spa', displayName: 'Spa & Wellness', description: 'Spa treatments and gym', color: '#14b8a6', icon: 'heart' }
    ]);
    console.log('🏢 Created departments');

    // ─── SERVICES CATALOG ────────────────────────────────────────────────────
    await Service.insertMany([
      { name: 'Room Service', category: 'room-service', description: 'In-room dining from our exquisite menu', price: 1500, currency: 'PKR', duration: 30, available: true, availableHours: { from: '06:00', to: '23:00' } },
      { name: 'Express Laundry', category: 'laundry', description: 'Same-day laundry and dry cleaning', price: 800, currency: 'PKR', duration: 180, available: true },
      { name: 'Premium Laundry', category: 'laundry', description: 'Premium care with ironing', price: 1200, currency: 'PKR', duration: 240, available: true },
      { name: 'Traditional Massage', category: 'spa', description: '60-minute relaxing full body massage', price: 5000, currency: 'PKR', duration: 60, available: true, availableHours: { from: '09:00', to: '21:00' } },
      { name: 'Aromatherapy', category: 'spa', description: '45-minute aromatherapy session', price: 4000, currency: 'PKR', duration: 45, available: true, availableHours: { from: '09:00', to: '21:00' } },
      { name: 'Airport Pickup', category: 'transportation', description: 'Luxury sedan airport transfer', price: 3500, currency: 'PKR', duration: 60, available: true },
      { name: 'City Tour', category: 'transportation', description: 'Half-day guided city tour with driver', price: 8000, currency: 'PKR', duration: 240, available: true },
      { name: 'Breakfast Buffet', category: 'dining', description: 'All-you-can-eat breakfast at the restaurant', price: 2500, currency: 'PKR', duration: 90, available: true, availableHours: { from: '06:30', to: '10:30' } },
      { name: 'Hi-Tea', category: 'dining', description: 'Afternoon high tea service', price: 2000, currency: 'PKR', duration: 90, available: true, availableHours: { from: '15:00', to: '18:00' } },
      { name: 'Wake-up Call', category: 'concierge', description: 'Scheduled wake-up call service', price: 0, currency: 'PKR', available: true },
      { name: 'Business Center', category: 'business', description: 'Printing, scanning, and meeting rooms', price: 1000, currency: 'PKR', duration: 60, available: true },
      { name: 'Extra Bed', category: 'room-service', description: 'Extra rollaway bed for room', price: 3000, currency: 'PKR', available: true },
      { name: 'Gym Access', category: 'recreation', description: '24-hour gym and fitness center access', price: 0, currency: 'PKR', available: true },
      { name: 'Pool Access', category: 'recreation', description: 'Swimming pool access with towels', price: 0, currency: 'PKR', available: true, availableHours: { from: '07:00', to: '22:00' } }
    ]);
    console.log('🛎️  Created services catalog');

    // ─── ROOMS ───────────────────────────────────────────────────────────────
    const pakistanHotels = [
      { cityName: 'Karachi', name: 'Movenpick Hotel Karachi', rating: 4.5, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT9SDH2FFhtXe2PKeZpcdPexmujnlhIeKCRKA&s', price: { standard: 22000, deluxe: 38000, suite: 72000 } },
      { cityName: 'Karachi', name: 'Pearl Continental Karachi', rating: 4.6, image: 'https://lh3.googleusercontent.com/p/AF1QipP_lmegf5X1buE6Blrl55xxOCvva3whMWCOzio=w324-h312-n-k-no', price: { standard: 24000, deluxe: 42000, suite: 85000, penthouse: 160000 } },
      { cityName: 'Karachi', name: 'Avari Towers Karachi', rating: 4.4, image: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/06/bd/e6/06/avari-towers-karachi.jpg?w=700&h=-1&s=1', price: { standard: 19000, deluxe: 34000, suite: 65000 } },
      { cityName: 'Karachi', name: 'The Grand Manor Karachi', rating: 4.7, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945', price: { standard: 25000, deluxe: 45000, suite: 90000, penthouse: 200000 } },
      { cityName: 'Karachi', name: 'Karachi Serena Hotel', rating: 4.6, image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4', price: { standard: 21000, deluxe: 38000, suite: 75000 } },
      { cityName: 'Lahore', name: 'Pearl Continental Lahore', rating: 4.5, image: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/09/55/63/30/pearl-continental-lahore.jpg?w=900&h=500&s=1', price: { standard: 20000, deluxe: 36000, suite: 70000, penthouse: 140000 } },
      { cityName: 'Lahore', name: 'Lahore Serena Hotel', rating: 4.7, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427', price: { standard: 23000, deluxe: 40000, suite: 80000, penthouse: 150000 } },
      { cityName: 'Lahore', name: 'Avari Lahore', rating: 4.4, image: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/27/16/b5/28/avari-hotel-lahore.jpg?w=900&h=500&s=1', price: { standard: 18000, deluxe: 32000, suite: 62000 } },
      { cityName: 'Lahore', name: 'Nishat Hotel Lahore', rating: 4.6, image: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791', price: { standard: 22000, deluxe: 40000, suite: 78000, penthouse: 155000 } },
      { cityName: 'Lahore', name: "Faletti's Hotel Lahore", rating: 4.2, image: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/262169208.jpg?k=094e22adf24c1dfc0fe5d89ec080ebdbe8a9426308357251aaf3af01973c7382&o=', price: { standard: 15000, deluxe: 28000, suite: 55000 } },
      { cityName: 'Islamabad', name: 'Islamabad Serena Hotel', rating: 4.6, image: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/183065428.jpg?k=23123f8db7249214d0796fdd0b446afa52e6ba89b5e9a5de1bb6899b00b876ff&o=', price: { standard: 24000, deluxe: 44000, suite: 88000, penthouse: 175000 } },
      { cityName: 'Islamabad', name: 'Islamabad Marriott Hotel', rating: 4.5, image: 'https://www.ticati.com/img/hotel/1499440s.jpg', price: { standard: 25000, deluxe: 45000, suite: 90000, penthouse: 190000 } },
      { cityName: 'Islamabad', name: 'Grand Hyatt Islamabad', rating: 4.7, image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d', price: { standard: 26000, deluxe: 46000, suite: 92000, penthouse: 195000 } },
      { cityName: 'Islamabad', name: 'The Envoy Hotel Islamabad', rating: 4.4, image: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791', price: { standard: 18000, deluxe: 32000, suite: 62000 } },
      { cityName: 'Islamabad', name: 'Roomy Signature Islamabad', rating: 4.3, image: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/25/d5/79/8c/roomy-signature.jpg?w=900&h=-1&s=1', price: { standard: 16000, deluxe: 29000, suite: 57000 } },
      { cityName: 'Peshawar', name: 'Pearl Continental Peshawar', rating: 4.4, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRpwbE02rXw9lSeHwHHmgE9UROtSPVm3PGkwA&s', price: { standard: 17000, deluxe: 30000, suite: 58000, penthouse: 120000 } },
      { cityName: 'Peshawar', name: 'The Khyber Hotel Peshawar', rating: 4.3, image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb', price: { standard: 14000, deluxe: 26000, suite: 50000 } },
      { cityName: 'Peshawar', name: 'Fort Continental Peshawar', rating: 4.2, image: 'https://pix10.agoda.net/hotelImages/30194698/0/eacd29d9668edf236526bc6e61735d71.jpg?ca=26&ce=0&s=1024x768', price: { standard: 13000, deluxe: 24000, suite: 47000 } },
      { cityName: 'Peshawar', name: 'The Pakhtun Hotel Peshawar', rating: 4.2, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427', price: { standard: 12000, deluxe: 22000, suite: 44000 } },
      { cityName: 'Quetta', name: 'Serena Quetta', rating: 4.5, image: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/08/72/e4/d7/quetta-serena-hotel.jpg?w=700&h=-1&s=1', price: { standard: 18000, deluxe: 33000, suite: 65000, penthouse: 130000 } },
      { cityName: 'Quetta', name: 'Bloom Star Hotel Quetta', rating: 4.2, image: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/04/d1/c8/37/garden.jpg?w=900&h=-1&s=1', price: { standard: 13000, deluxe: 24000, suite: 48000 } },
      { cityName: 'Quetta', name: 'Quetta International Hotel', rating: 4.1, image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa', price: { standard: 12000, deluxe: 21000, suite: 42000 } },
    ];

    const roomTypeConfig = {
      standard: {
        floor: 1, capacity: { adults: 2, children: 1 }, beds: 'double', size: 280,
        amenities: ['wifi', 'tv', 'airConditioning', 'safe'],
        suffixCode: 1
      },
      deluxe: {
        floor: 2, capacity: { adults: 2, children: 1 }, beds: 'king', size: 380,
        amenities: ['wifi', 'tv', 'airConditioning', 'minibar', 'roomService', 'safe', 'workspace'],
        suffixCode: 2
      },
      suite: {
        floor: 5, capacity: { adults: 3, children: 1 }, beds: 'king', size: 650,
        amenities: ['wifi', 'tv', 'airConditioning', 'minibar', 'roomService', 'balcony', 'jacuzzi', 'safe', 'workspace', 'cityView'],
        suffixCode: 3
      },
      penthouse: {
        floor: 10, capacity: { adults: 4, children: 2 }, beds: 'king', size: 1200,
        amenities: ['wifi', 'tv', 'airConditioning', 'minibar', 'roomService', 'balcony', 'jacuzzi', 'safe', 'workspace', 'cityView', 'kitchen', 'concierge'],
        suffixCode: 4
      }
    };

    const roomDocs = [];
    pakistanHotels.forEach((hotel, hotelIndex) => {
      const hotelCode = (hotelIndex + 1) * 100;
      const roomTypes = ['standard', 'deluxe', 'suite'];
      if (hotel.price.penthouse) roomTypes.push('penthouse');

      roomTypes.forEach(type => {
        const cfg = roomTypeConfig[type];
        const roomNumber = `${hotelCode + cfg.suffixCode}`;
        const basePrice = hotel.price[type];

        roomDocs.push({
          roomNumber,
          name: `${hotel.cityName} ${type.charAt(0).toUpperCase() + type.slice(1)} – ${hotel.name}`,
          type,
          floor: cfg.floor,
          capacity: cfg.capacity,
          beds: cfg.beds,
          size: cfg.size,
          price: {
            basePrice,
            weekendPrice: Math.round(basePrice * 1.2),
            seasonalMultiplier: 1
          },
          amenities: cfg.amenities,
          description: {
            short: `${type.charAt(0).toUpperCase() + type.slice(1)} room at ${hotel.name}, ${hotel.cityName}.`,
            full: `Experience world-class Pakistani hospitality at ${hotel.name} in ${hotel.cityName}. This ${type} room offers modern amenities and comfort.`
          },
          images: [{ url: hotel.image, caption: hotel.name, isPrimary: true }],
          status: 'available',
          cleaningStatus: 'clean',
          rating: { average: hotel.rating, count: 30 + hotelIndex * 5 },
          isActive: true
        });
      });
    });

    const rooms = await Room.insertMany(roomDocs);
    console.log(`🛏️  Created ${rooms.length} rooms across ${pakistanHotels.length} hotels`);

    // ─── BOOKINGS (diverse statuses) ─────────────────────────────────────────
    const today = new Date();
    const bookingsData = [
      {
        bookingNumber: 'BK-PK-001',
        guest: guestUsers[0]._id,
        room: rooms[0]._id,
        checkIn: new Date(today.getTime() - 1 * 86400000),
        checkOut: new Date(today.getTime() + 2 * 86400000),
        guests: { adults: 2, children: 0 },
        status: 'checked-in',
        pricing: { roomRate: rooms[0].price.basePrice, nights: 3, subtotal: rooms[0].price.basePrice * 3, taxes: Math.round(rooms[0].price.basePrice * 3 * 0.16), fees: 0, total: Math.round(rooms[0].price.basePrice * 3 * 1.16) },
        payment: { method: 'credit-card', status: 'paid', paidAmount: Math.round(rooms[0].price.basePrice * 3 * 1.16) },
        source: 'website'
      },
      {
        bookingNumber: 'BK-PK-002',
        guest: guestUsers[1]._id,
        room: rooms[3]._id,
        checkIn: new Date(today.getTime() + 3 * 86400000),
        checkOut: new Date(today.getTime() + 6 * 86400000),
        guests: { adults: 2, children: 1 },
        status: 'confirmed',
        pricing: { roomRate: rooms[3].price.basePrice, nights: 3, subtotal: rooms[3].price.basePrice * 3, taxes: Math.round(rooms[3].price.basePrice * 3 * 0.16), fees: 0, total: Math.round(rooms[3].price.basePrice * 3 * 1.16) },
        payment: { method: 'bank-transfer', status: 'pending', paidAmount: 0 },
        source: 'phone'
      },
      {
        bookingNumber: 'BK-PK-003',
        guest: guestUsers[2]._id,
        room: rooms[5]._id,
        checkIn: new Date(today.getTime() - 5 * 86400000),
        checkOut: new Date(today.getTime() - 2 * 86400000),
        guests: { adults: 1, children: 0 },
        status: 'checked-out',
        pricing: { roomRate: rooms[5].price.basePrice, nights: 3, subtotal: rooms[5].price.basePrice * 3, taxes: Math.round(rooms[5].price.basePrice * 3 * 0.16), fees: 0, total: Math.round(rooms[5].price.basePrice * 3 * 1.16) },
        payment: { method: 'credit-card', status: 'paid', paidAmount: Math.round(rooms[5].price.basePrice * 3 * 1.16) },
        source: 'website'
      },
      {
        bookingNumber: 'BK-PK-004',
        guest: guestUsers[0]._id,
        room: rooms[10]._id,
        checkIn: new Date(today.getTime() + 7 * 86400000),
        checkOut: new Date(today.getTime() + 10 * 86400000),
        guests: { adults: 2, children: 0 },
        status: 'confirmed',
        pricing: { roomRate: rooms[10].price.basePrice, nights: 3, subtotal: rooms[10].price.basePrice * 3, taxes: Math.round(rooms[10].price.basePrice * 3 * 0.16), fees: 0, total: Math.round(rooms[10].price.basePrice * 3 * 1.16) },
        payment: { method: 'credit-card', status: 'paid', paidAmount: Math.round(rooms[10].price.basePrice * 3 * 1.16) },
        source: 'website'
      }
    ];

    const bookings = await Booking.insertMany(bookingsData);
    console.log(`📅 Created ${bookings.length} bookings`);

    // ─── INVOICES ────────────────────────────────────────────────────────────
    const invoiceDoc = new Invoice({
      invoiceNumber: 'INV-2026-0001',
      booking: bookings[2]._id,
      guest: guestUsers[2]._id,
      items: [{
        description: `Room ${rooms[5].roomNumber} — 3 nights`,
        category: 'room',
        quantity: 3,
        unitPrice: rooms[5].price.basePrice,
        total: rooms[5].price.basePrice * 3
      }],
      summary: {
        subtotal: rooms[5].price.basePrice * 3,
        taxRate: 0.16,
        taxes: Math.round(rooms[5].price.basePrice * 3 * 0.16),
        total: Math.round(rooms[5].price.basePrice * 3 * 1.16)
      },
      payment: {
        status: 'paid',
        method: 'credit-card',
        paidAmount: Math.round(rooms[5].price.basePrice * 3 * 1.16)
      },
      issuedBy: admin._id
    });
    await invoiceDoc.save();
    console.log('🧾 Created sample invoice');

    // ─── TASKS ───────────────────────────────────────────────────────────────
    await Task.insertMany([
      {
        title: 'Deep Clean Room 101',
        description: 'Full deep cleaning after long-term guest checkout',
        type: 'housekeeping',
        priority: 'high',
        room: rooms[0]._id,
        assignedTo: staffUsers[0]._id,
        createdBy: admin._id,
        status: 'in-progress',
        dueDate: new Date(today.getTime() + 4 * 60 * 60 * 1000),
        checklist: [
          { item: 'Strip bed linens', completed: true },
          { item: 'Clean bathroom', completed: true },
          { item: 'Vacuum carpets', completed: false },
          { item: 'Restock minibar', completed: false }
        ]
      },
      {
        title: 'Fix AC in Room 502',
        description: 'Guest reported AC not cooling properly',
        type: 'maintenance',
        priority: 'high',
        room: rooms[2]._id,
        assignedTo: staffUsers[2]._id,
        createdBy: admin._id,
        status: 'pending',
        dueDate: new Date(today.getTime() + 2 * 60 * 60 * 1000)
      },
      {
        title: 'Evening Turndown Service',
        description: 'Standard evening turndown for all occupied rooms',
        type: 'housekeeping',
        priority: 'medium',
        createdBy: admin._id,
        status: 'pending',
        dueDate: new Date(today.getTime() + 6 * 60 * 60 * 1000)
      }
    ]);
    console.log('📋 Created sample tasks');

    // ─── FEEDBACK ────────────────────────────────────────────────────────────
    await Feedback.insertMany([
      {
        guest: guestUsers[0]._id,
        booking: bookings[0]._id,
        type: 'review',
        ratings: { overall: 5, cleanliness: 5, staff: 5, comfort: 4, location: 5, valueForMoney: 4 },
        comment: 'Absolutely wonderful stay! The staff was incredibly welcoming and the room was spotless. Pakistani hospitality at its finest!',
        status: 'approved',
        isPublic: true
      },
      {
        guest: guestUsers[1]._id,
        type: 'suggestion',
        ratings: { overall: 4, cleanliness: 4, staff: 4, comfort: 4, location: 5, valueForMoney: 3 },
        comment: 'Great hotel but could improve the breakfast variety. Would love to see more traditional Pakistani dishes.',
        status: 'approved',
        isPublic: true
      }
    ]);
    console.log('💬 Created sample feedback');

    // ─── NOTIFICATIONS ───────────────────────────────────────────────────────
    await Notification.insertMany([
      {
        recipient: admin._id,
        type: 'booking',
        title: 'New Booking Received',
        message: 'Ahmed Khan booked Room 101 for 3 nights starting today.',
        priority: 'normal',
        isRead: false
      },
      {
        recipient: admin._id,
        type: 'maintenance',
        title: 'Urgent: AC Issue',
        message: 'Room 502 AC reported broken. Guest complaint filed.',
        priority: 'urgent',
        isRead: false
      },
      {
        recipient: guestUsers[0]._id,
        type: 'check-in',
        title: 'Welcome to Grand Azure!',
        message: 'You have been checked in. Enjoy your stay!',
        priority: 'normal',
        isRead: true,
        readAt: new Date()
      },
      {
        recipient: admin._id,
        type: 'system',
        title: 'System Update',
        message: 'Hotel management system has been updated to the latest version.',
        priority: 'low',
        isRead: false
      },
      {
        recipient: staffUsers[0]._id,
        type: 'housekeeping',
        title: 'New Task Assigned',
        message: 'You have been assigned: Deep Clean Room 101.',
        priority: 'high',
        isRead: false
      }
    ]);
    console.log('🔔 Created sample notifications');

    // ─── MAINTENANCE REQUESTS ────────────────────────────────────────────────
    await MaintenanceRequest.insertMany([
      {
        ticketNumber: 'MNT-2026-0001',
        room: rooms[2]._id,
        reportedBy: guestUsers[0]._id,
        category: 'hvac',
        priority: 'high',
        title: 'AC Not Cooling',
        description: 'Air conditioning unit is blowing warm air. Room temperature is uncomfortable.',
        status: 'in-progress',
        assignedTo: staffUsers[2]._id
      },
      {
        ticketNumber: 'MNT-2026-0002',
        room: rooms[5]._id,
        reportedBy: staffUsers[0]._id,
        category: 'plumbing',
        priority: 'medium',
        title: 'Bathroom Faucet Leaking',
        description: 'Slow drip from hot water faucet in the bathroom.',
        status: 'open'
      }
    ]);
    console.log('🔧 Created sample maintenance requests');

    // ─── SETTINGS ────────────────────────────────────────────────────────────
    await Settings.create({
      key: 'main',
      hotelInfo: {
        name: 'Grand Azure Pakistan',
        tagline: 'Authentic Hospitality, Timeless Luxury',
        description: 'Discover the heart of Pakistan with Grand Azure. Our network of premium hotels across Karachi, Lahore, and Islamabad offers a blend of traditional warmth and modern sophistication.',
        address: { street: 'Main Boulevard, Gulberg III', city: 'Lahore', state: 'Punjab', zipCode: '54000', country: 'Pakistan' },
        contact: { phone: '+92 (42) 111-222-333', email: 'info@grandazure.pk', fax: '+92 (42) 111-222-334' }
      },
      booking: {
        checkInTime: '14:00',
        checkOutTime: '12:00',
        cancellationPolicy: { freeCancellationHours: 24, cancellationFeePercent: 50 },
        depositRequired: false
      },
      pricing: {
        currency: 'PKR',
        currencySymbol: 'Rs.',
        taxRate: 0.16,
        serviceChargeRate: 0.05,
        weekendMultiplier: 1.2
      }
    });
    console.log('⚙️  Created settings');

    // ─── SUMMARY ─────────────────────────────────────────────────────────────
    console.log('\n========================================');
    console.log('✅ Database seeded successfully!');
    console.log('========================================');
    console.log('\nCollections populated:');
    console.log(`  users              : ${await User.countDocuments()}`);
    console.log(`  rooms              : ${await Room.countDocuments()}`);
    console.log(`  bookings           : ${await Booking.countDocuments()}`);
    console.log(`  invoices           : ${await Invoice.countDocuments()}`);
    console.log(`  tasks              : ${await Task.countDocuments()}`);
    console.log(`  feedback           : ${await Feedback.countDocuments()}`);
    console.log(`  departments        : ${await Department.countDocuments()}`);
    console.log(`  services           : ${await Service.countDocuments()}`);
    console.log(`  notifications      : ${await Notification.countDocuments()}`);
    console.log(`  maintenance reqs   : ${await MaintenanceRequest.countDocuments()}`);
    console.log(`  settings           : ${await Settings.countDocuments()}`);
    console.log('\nTest Accounts:');
    console.log('  Admin   : admin@hotel.com / admin123');
    console.log('  Staff   : manager@grandazure.pk / staff123');
    console.log('  Guest   : ahmed.khan@email.pk / guest123');
    console.log('  Guest 2 : fatima.ali@email.pk / guest123');
    console.log('  Guest 3 : omar.hussain@email.pk / guest123');
    console.log('========================================\n');

    fs.writeFileSync(path.join(__dirname, 'seed_success.txt'), `Database seeded successfully at ${new Date().toISOString()}`);
    process.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(__dirname, 'seed_error.txt'), `❌ Seed error: ${error.message}\nStack: ${error.stack}`);
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seedDatabase();
