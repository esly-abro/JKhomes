/**
 * Initialize Test Users in MongoDB
 * Creates owner, admin, and agent users for testing
 * Also creates the JK Homes organization and links all users to it
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// MongoDB connection - use env variable
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jkhomes';

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['owner', 'admin', 'manager', 'agent', 'bpo'],
    default: 'agent'
  },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  zohoUserId: { type: String },
  isActive: { type: Boolean, default: true },
  approvalStatus: { type: String, default: 'approved' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Organization Schema (simplified for init)
const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true, trim: true },
  ownerId: { type: mongoose.Schema.Types.Mixed, required: true },
  plan: { type: String, enum: ['free', 'starter', 'professional', 'enterprise'], default: 'free' },
  logoUrl: { type: String, default: null },
  settings: {
    timezone: { type: String, default: 'Asia/Kolkata' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    currency: { type: String, default: 'INR' }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Organization = mongoose.model('Organization', organizationSchema);

async function initializeUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check if users already exist
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      console.log(`⚠️  Found ${existingUsers} existing users`);
      console.log('Clearing existing users...');
      await User.deleteMany({});
    }

    // Create test users
    const users = [
      {
        email: 'owner@jkhomes.com',
        passwordHash: await bcrypt.hash('owner123', 10),
        name: 'J Kamalakannan',
        role: 'owner',
        isActive: true,
        approvalStatus: 'approved'
      },
      {
        email: 'admin@jkhomes.com',
        passwordHash: await bcrypt.hash('admin123', 10),
        name: 'J Kamalakannan',
        role: 'admin',
        isActive: true,
        approvalStatus: 'approved'
      },
      {
        email: 'manager@jkhomes.com',
        passwordHash: await bcrypt.hash('manager123', 10),
        name: 'Manager User',
        role: 'manager',
        isActive: true,
        approvalStatus: 'approved'
      },
      {
        email: 'agent@jkhomes.com',
        passwordHash: await bcrypt.hash('agent123', 10),
        name: 'Agent User',
        role: 'agent',
        isActive: true,
        approvalStatus: 'approved'
      },
      {
        email: 'bpo@jkhomes.com',
        passwordHash: await bcrypt.hash('bpo123', 10),
        name: 'BPO User',
        role: 'bpo',
        isActive: true,
        approvalStatus: 'approved'
      }
    ];

    console.log('Creating test users...\n');
    for (const userData of users) {
      const user = await User.create(userData);
      console.log(`✅ Created: ${user.email} (${user.role})`);
    }

    // Create JK Homes Organization
    console.log('\nCreating JK Homes organization...');
    const ownerUser = await User.findOne({ email: 'owner@jkhomes.com' });
    
    // Remove existing org if re-running
    await Organization.deleteMany({ slug: 'jk-homes' });
    
    const org = await Organization.create({
      name: 'JK Homes',
      slug: 'jk-homes',
      ownerId: ownerUser._id,
      plan: 'professional',
      settings: {
        timezone: 'Asia/Kolkata',
        dateFormat: 'DD/MM/YYYY',
        currency: 'INR'
      },
      isActive: true
    });
    console.log(`✅ Created organization: ${org.name} (${org._id})`);

    // Link all users to the organization
    console.log('\nLinking users to organization...');
    const linkResult = await User.updateMany(
      { email: /@jkhomes\.com$/i },
      { $set: { organizationId: org._id } }
    );
    console.log(`✅ Linked ${linkResult.modifiedCount} users to JK Homes\n`);

    console.log('\n═══════════════════════════════════════════════');
    console.log('  Test Users & Organization Created Successfully!');
    console.log('═══════════════════════════════════════════════\n');
    
    console.log('Login Credentials:\n');
    console.log('Owner:   owner@jkhomes.com   / owner123');
    console.log('Admin:   admin@jkhomes.com   / admin123');
    console.log('Manager: manager@jkhomes.com / manager123');
    console.log('Agent:   agent@jkhomes.com   / agent123');
    console.log('BPO:     bpo@jkhomes.com     / bpo123');
    
    console.log('\n🌐 Open: http://localhost:5173');
    console.log('   Use any credentials above to login\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

initializeUsers();
