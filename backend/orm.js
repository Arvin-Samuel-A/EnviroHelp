import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();
const MONGO_URI = process.env.MONGO_URI;

const { Schema } = mongoose;

const adminSchema = new Schema({
  name: { type: String, required: true }
}, { collection: 'admin' });

const campaignSchema = new Schema({
  campaigner_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Campaigner'},
  name: { type: String, required: true },
  description: { type: String },
  start_date: { type: Date },
  end_date: { type: Date },
  goal: { type: String },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', default: null },
  is_flagged: { type: Boolean, default: false },
  completion_percent: { type: Number, default: 0 },
  contact: { type: String },
  created_date: { type: Date }
}, { collection: 'campaign' });

campaignSchema.virtual('campaigner', {
    ref: 'Campaigner',
    localField: 'campaigner_id',
    foreignField: '_id',
    justOne: true
})

campaignSchema.virtual('volunteer', {
    ref: 'Volunteer',
    localField: 'assigned_to',
    foreignField: '_id',
    justOne: true
})

const campaignerSchema = new Schema({
  name: { type: String, required: true },
  is_flagged: { type: Boolean, default: false },
  contact: { type: String },
  profile_pic: { type: String },
  email: { type: String },
}, { collection: 'campaigner' });

const loginSchema = new Schema({
  username: { type: String, required: true },
  hash: { type: String, required: true },
  id: { type: mongoose.Schema.Types.ObjectId, required: true},
  role: { type: String, required: true }
}, { collection: 'login' });

const requestSchema = new Schema({
  campaign_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Campaign' },
  volunteer_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Volunteer' },
  requirements: { type: String },
  assigned: { type: Boolean, required: true, default: false },
  campaigner_updated: { type: Boolean, default: false },
  volunteer_updated: { type: Boolean, default: false }
}, { collection: 'request' });

requestSchema.virtual('campaign', {
    ref: 'Campaign',
    localField: 'campaign_id',
    foreignField: '_id',
    justOne: true
})

requestSchema.virtual('volunteer', {
    ref: 'Volunteer',
    localField: 'volunteer_id',
    foreignField: '_id',
    justOne: true
})

const volunteerSchema = new Schema({
  name: { type: String, required: true },
  campaigns_completed: { type: Number, default: 0 },
  profile_pic: { type: String },
  is_flagged: { type: Boolean, default: false },
  contact: { type: String },
  email: { type: String }
}, { collection: 'volunteer' });


const Admin = mongoose.model('Admin', adminSchema);
const Campaign = mongoose.model('Campaign', campaignSchema);
const Campaigner = mongoose.model('Campaigner', campaignerSchema);
const Login = mongoose.model('Login', loginSchema);
const Request = mongoose.model('Request', requestSchema);
const Volunteer = mongoose.model('Volunteer', volunteerSchema);

async function initDB() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Connection to MongoDB failed: ', err);
        process.exit(1);
    }
}
export  {
    initDB,
    Admin,
    Campaign,
    Campaigner,
    Login,
    Request,
    Volunteer
};