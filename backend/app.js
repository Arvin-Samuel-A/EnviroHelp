import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";
import { Types } from "mongoose";

import {
    initDB,
    // Admin,
    Campaign,
    Campaigner,
    Login,
    Request,
    Volunteer
} from "./orm.js";

import {
    authenticate,
    checkVolunteer,
    checkCampaignForRequest,
    checkCampaignForWork,
    checkCampaigner,
    checkCampaignExists,
    checkForRequest
} from "./middleware.js";

const ObjectId = Types.ObjectId;

dotenv.config();
const app = express();
const PORT = process.env.PORT;
const SECRET_KEY = process.env.SECRET_KEY;

app.use(express.json());
app.use(cors());

const startServer = async () => {
    try {
        await initDB();
        app.listen(PORT, (err) => {
            if (!err) {
                console.log("Server started");
            } else {
                console.error("Server start failed");
            }
        })
    } catch (err) {
        console.error("Error connecting to MongoDB:", err);
    }
}


app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (username == null || password == null) {
        return res.status(400).json({ error: "One or more fields are missing" });
    }

    const user = await Login.findOne({ username: username }).lean();
    if (user == null) {
        return res.status(404).json({ error: "User not Found" });
    }

    if (!await bcrypt.compare(password, user.hash)) {
        return res.status(401).json({ error: "Invalid Credentials" });
    }

    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: "1h" });
    res.json({ session_id: token, role: user.role });
});

app.post("/create_account", async (req, res) => {
    const { username, password, role } = req.body;
    if (username == null || password == null) {
        return res.status(400).json({ error: "One or more fields are missing" });
    }

    const user = await Login.findOne({ username: username }).lean();
    if (user !== null) {
        return res.status(409).json({ error: "User already exists" });
    }

    if (role === 'campaigner') {
        const { name, contact, image, email } = req.body;
        if (name == null || contact == null || image == null || email == null) {
            return res.status(400).json({ error: "One or more fields are missing" });
        }

        const campaigner = await Campaigner.create({ name: name, contact: contact, profile_pic: image, email: email });
        await Login.create({ username: username, hash: await bcrypt.hash(password, 12), id: campaigner._id, role: "campaigner" });

        const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: "1h" });
        res.status(201).json({ session_id: token, role: "campaigner" });
    } else if (role === 'volunteer') {
        const { name, image, contact, email } = req.body;
        if (name == null || contact == null || image == null || email == null) {
            return res.status(400).json({ error: "One or more fields are missing" });
        }

        const volunteer = await Volunteer.create({ name: name, profile_pic: image, contact: contact, email: email });
        await Login.create({ username: username, hash: await bcrypt.hash(password, 12), id: volunteer._id, role: "volunteer" });

        const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: "1h" });
        res.status(201).json({ session_id: token, role: "volunteer" });
    } else {
        return res.status(400).json({ error: "Invalid role" });
    }
});

app.get("/volunteer/home", authenticate, checkVolunteer, async (req, res) => {
    const activeCampaigns = [];
    const newRequests = [];

    for (let campaign of await Campaign.find({ assigned_to: req.volunteer._id, completion_percent: { $lt: 100 } })) {
        activeCampaigns.push({ id: campaign._id.toString(), name: campaign.name, completion_percent: campaign.completion_percent, is_flagged: campaign.is_flagged });
    }

    for (let request of await Request.find({ volunteer_id: req.volunteer._id, assigned: false }).populate('campaign')) {
        if (request.campaign.assigned_to == null) {
            await request.campaign.populate('campaigner');
            newRequests.push({ id: request.campaign_id.toString(), name: request.campaign.campaigner.name, campaigner_updated: request.campaigner_updated })
        } else {
            Request.findByIdAndDelete(request._id);
        }
    }

    return res.status(200).json({
        name: req.volunteer.name,
        profile_pic: req.volunteer.profile_pic,
        campaigns_completed: req.volunteer.campaigns_completed,
        is_flagged: req.volunteer.is_flagged,
        active_campaigns: activeCampaigns,
        new_requests: newRequests
    })
});

app.get("/volunteer/request/view/:campaign_id", authenticate, checkVolunteer, checkCampaignForRequest, async (req, res) => {
    res.status(200).json({ campaign_id: req.campaignId, name: req.campaign.name, requirements: req.request.requirements, campaigner_updated: req.request.campaigner_updated, contact: req.campaign.contact });
    req.request.campaigner_updated = false;
    await req.request.save();
})

app.patch("/volunteer/request/view/:campaign_id", authenticate, checkVolunteer, checkCampaignForRequest, async (req, res) => {
    const { requirements, assigned } = req.body;
    if (requirements == null) {
        return res.status(400).json({ error: "One or more fields are missing" });
    }

    if (req.request.assigned === false) {
        if (assigned === "true") {
            if (req.request.volunteer_updated === false) {
                req.campaign.assigned_to = req.volunteer._id;
                req.request.assigned = true;
                await req.request.save();
                await req.campaign.save();
                return res.status(200).json({ message: "Request accepted" });
            } else {
                return res.status(401).json({ error: "You cannot accept a request you just edited" })
            }
        } else {
            req.request.requirements = requirements;
            req.request.volunteer_updated = true;
            await req.request.save();
            return res.status(200).json({ message: "Request updated" });
        }
    } else {
        return res.status(401).json({ error: "You cannot change a accepted request" })
    }
})

app.delete("/volunteer/request/view/:campaign_id", authenticate, checkVolunteer, checkCampaignForRequest, async (req, res) => {
    if (req.request.assigned !== true) {
        await Request.findByIdAndDelete(req.request._id);
        return res.status(200).json({ message: "Request deleted" });
    } else {
        return res.status(401).json({ error: "You cannot delete an accepted request" })
    }
})

app.post("/volunteer/request/view/:campaign_id", authenticate, checkVolunteer, async (req, res) => {
    const campaignId = req.params.campaign_id;
    if (!campaignId) {
        return res.status(400).json({ error: "Campaign Id is missing" });
    }

    const request = await Request.findOne({ campaign_id: new ObjectId(campaignId), volunteer_id: req.volunteer._id });
    if (request !== null) {
        return res.status(400).json({ error: "Request already exists" });
    }

    const { requirements } = req.body;
    await Request.create({ campaign_id: new ObjectId(campaignId), volunteer_id: req.volunteer._id, requirements: requirements, volunteer_updated: true })
    return res.status(201).json({ message: "Request created" });
})

app.get("/volunteer/campaign/view/:campaign_id", authenticate, checkVolunteer, checkCampaignForWork, async (req, res) => {
    return res.status(200).json(req.campaign.toJSON());
})

app.patch("/volunteer/campaign/view/:campaign_id", authenticate, checkVolunteer, checkCampaignForWork, async (req, res) => {
    const { completion_percent } = req.body;
    if (completion_percent == null) {
        return res.status(400).json({ error: "Completion percentage is missing" });
    }

    if (req.campaign.completion_percent > completion_percent) {
        return res.status(400).json({ error: "Completion percentage cannot be decreased" });
    }

    if (completion_percent > 100) {
        return res.status(400).json({ error: "Completion percentage should be less than or equal to 100" });
    }

    req.campaign.completion_percent = completion_percent;
    await req.campaign.save();

    if (completion_percent === 100) {
        req.volunteer.campaigns_completed++;
        await req.volunteer.save();
    }

    return res.status(200).json({ message: "Completion Percentage updated" });
})

app.get("/volunteer/find/:search", authenticate, checkVolunteer, async (req, res) => {
    const search = req.params.search;
    const campaigns = await Campaign.find({ name: { $regex: search, $options: 'i' }, is_flagged: false, assigned_to: null });

    if (campaigns.length === 0) {
        return res.status(200).json({ campaigns: [] });
    }

    const campaignIds = campaigns.map(c => c._id);
    const requests = await Request.find({
        campaign_id: { $in: campaignIds },
        volunteer_id: req.volunteer._id
    });

    const requestedCampaigns = new Set(requests.map(req => req.campaign_id.toString()));

    const filteredCampaigns = campaigns
        .filter(campaign => !requestedCampaigns.has(campaign._id.toString()))
        .map(campaign => ({ id: campaign._id.toString(), name: campaign.name }));

    return res.status(200).json({ campaigns: filteredCampaigns });
})

app.get("/campaigner/home", authenticate, checkCampaigner, async (req, res) => {
    const activeCampaigns = [];
    const newRequests = [];

    for (let campaign of await Campaign.find({ campaigner_id: req.campaigner._id, assigned_to: { $ne: null }, completion_percent: { $lt: 100 } })) {
        activeCampaigns.push({ id: campaign._id.toString(), name: campaign.name, completion_percent: campaign.completion_percent, is_flagged: campaign.is_flagged });
    }

    for (let request of await Request.find({ assigned: false }).populate('campaign').populate('volunteer')) {
        if (request.campaign.campaigner_id.equals(req.campaigner._id)) {
            if (request.campaign.assigned_to == null) {
                newRequests.push({ id: request.campaign_id, name: request.volunteer.name, volunteer_updated: request.volunteer_updated, volunteer_id: request.volunteer_id.toString() });
            } else {
                Request.findByIdAndDelete(request._id);
            }
        }
    }

    return res.status(200).json({
        name: req.campaigner.name,
        is_flagged: req.campaigner.is_flagged,
        profile_pic: req.campaigner.profile_pic,
        active_campaigns: activeCampaigns,
        new_requests: newRequests,
    })
})

app.get("/campaigner/campaign", authenticate, checkCampaigner, async (req, res) => {
    const assignedCampaigns = [];
    const unassignedCampaigns = [];

    for (let campaign of await Campaign.find({ campaigner_id: req.campaigner._id })) {
        if (campaign.assigned_to != null) {
            assignedCampaigns.push({ id: campaign._id.toString(), name: campaign.name, completion_percent: campaign.completion_percent, is_flagged: campaign.is_flagged });
        } else {
            unassignedCampaigns.push({ id: campaign._id.toString(), name: campaign.name, completion_percent: campaign.completion_percent, is_flagged: campaign.is_flagged });
        }
    }

    return res.status(200).json({ assigned_campaigns: assignedCampaigns, unassigned_campaigns: unassignedCampaigns });
})

app.get("/campaigner/campaign/view/:campaign_id", authenticate, checkCampaigner, checkCampaignExists, async (req, res) => {
    return res.status(200).json({
        name: req.campaign.name,
        description: req.campaign.description,
        start_date: req.campaign.start_date,
        end_date: req.campaign.end_date,
        goal: req.campaign.goal,
        assigned_to: req.campaign.assigned_to,
        is_flagged: req.campaign.is_flagged,
        completion_percent: req.campaign.completion_percent,
        contact: req.campaign.contact,
        created_date: req.campaign.created_date
    })
})

app.patch("/campaigner/campaign/view/:campaign_id", authenticate, checkCampaigner, checkCampaignExists, async (req, res) => {
    const {
        name,
        description,
        start_date,
        end_date,
        goal,
        contact
    } = req.body;

    if (name == null || description == null || start_date == null || end_date == null || goal == null || contact == null) {
        return res.status(400).json({ error: "One or more fields are missing" })
    }

    req.campaign.name = name;
    req.campaign.description = description;
    req.campaign.start_date = start_date;
    req.campaign.end_date = end_date;
    req.campaign.goal = goal;
    req.campaign.contact = contact;
    
    await req.campaign.save();
    return res.status(200).json({ message: "Campaign is updated" })
})

app.delete("/campaigner/campaign/view/:campaign_id", authenticate, checkCampaigner, checkCampaignExists, async (req, res) => {
    if (req.campaign.assigned_to !== null) {
        return res.status(401).json({ error: "You cannot delete an assigned campaign" })
    }

    await Campaign.findByIdAndDelete(req.campaign._id);
    return res.status(200).json({ message: "Campaign deleted" });
})

app.post("/campaigner/campaign/view", authenticate, checkCampaigner, async (req, res) => {
    const {
        name,
        description,
        start_date,
        end_date,
        goal,
        contact
    } = req.body;

    if (name == null || description == null || start_date == null || end_date == null || goal == null || contact == null) {
        return res.status(400).json({ error: "One or more fields are missing" });
    }

    await Campaign.create({ campaigner_id: req.campaigner._id, name: name, description: description, start_date: start_date, end_date: end_date, goal: goal, contact: contact, created_date: (new Date()).toISOString() });
    return res.status(200).json({ message: "Campaign was created successfully" });
})

app.get("/campaigner/volunteer/:search", authenticate, checkCampaigner, async (req, res) => {
    const search = req.params.search;
    
    const volunteers = await Volunteer.find({ name: { $regex: search, $options: 'i' }, is_flagged: false });
    const result = volunteers.map(volunteer => ({ id: volunteer._id.toString(), name: volunteer.name }));

    return res.status(200).json({ volunteers: result });
})

app.get("/campaigner/volunteer/view/:volunteer_id", authenticate, checkCampaigner, async (req, res) => {
    const volunteerId = req.params.volunteer_id;
    if (!volunteerId) {
        return res.status(400).json({ error: "Volunteer Id is missing" });
    }

    const volunteer = await Volunteer.findById(volunteerId);
    if (volunteer == null) {
        return res.status(404).json({ error: "Volunteer not found" });
    }

    return res.status(200).json({ name: volunteer.name, campaigns_completed: volunteer.campaigns_completed, profile_pic: volunteer.profile_pic, contact: volunteer.contact });
})

app.get("/campaigner/request/view/:campaign_id/:volunteer_id", authenticate, checkCampaigner, checkForRequest, async (req, res) => {
    res.status(200).json({ name: req.request.volunteer.name, requirements: req.request.requirements, contact: req.request.campaign.contact, volunteer_updated: req.request.volunteer_updated });
    req.request.campaigner_updated = false;
    await req.request.save();
})

app.patch("/campaigner/request/view/:campaign_id/:volunteer_id", authenticate, checkCampaigner, checkForRequest, async (req, res) => {
    const { requirements, assigned } = req.body;
    if (requirements == null) {
        return res.status(400).json({ error: "One or more fields are missing" });
    }

    if (req.request.assigned === false) {
        if (assigned === "true") {
            if (req.request.campaigner_updated === false) {
                req.campaign.assigned_to = req.request.volunteer_id;
                req.request.assigned = true;
                await req.request.save();
                await req.campaign.save();
                return res.status(200).json({ message: "Request accepted" });
            } else {
                return res.status(401).json({ error: "You cannot accept a request you just edited" })
            }
        } else {
            req.request.requirements = requirements;
            req.request.campaigner_updated = true;
            await req.request.save();
            return res.status(200).json({ message: "Request updated" });
        }
    } else {
        return res.status(401).json({ error: "You cannot change a accepted request" })
    }
})

app.delete("/campaigner/request/view/:campaign_id/:volunteer_id", authenticate, checkCampaigner, checkForRequest, async (req, res) => {
    if (req.request.assigned !== true) {
        await Request.findByIdAndDelete(req.request._id);
        return res.status(200).json({ message: "Request deleted" });
    } else {
        return res.status(401).json({ error: "You cannot delete an accepted request" })
    }
})

app.post("/campaigner/request/view/:campaign_id/:volunteer_id", authenticate, checkCampaigner, async (req, res) => {
    const campaignId = req.params.campaign_id;
    const volunteerId = req.params.volunteer_id;
    if (!campaignId || !volunteerId) {
        return res.status(400).json({ error: "Campaign Id or Volunteer Id is missing" });
    }

    const request = await Request.findOne({ campaign_id: new ObjectId(campaignId), volunteer_id: new ObjectId(volunteerId) });
    if (request !== null) {
        return res.status(400).json({ error: "Request already exists" });
    }

    const { requirements } = req.body;
    await Request.create({ campaign_id: new ObjectId(campaignId), volunteer_id: new ObjectId(volunteerId), requirements: requirements, campaigner_updated: true, assigned: false })
    return res.status(201).json({ message: "Request created" });
})

startServer();
