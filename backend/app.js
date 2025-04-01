require('dotenv').config();
const express = require('express');
const {
    initDB,
    Admin,
    Campaign,
    Campaigner,
    Login,
    Request,
    Volunteer
} = require("./orm")

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const ObjectId = require("mongoose").Types.ObjectId;

const app = express();
const PORT = process.env.PORT;
const SECRET_KEY = process.env.SECRET_KEY;

app.use(express.json());

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

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: "Forbidden: Invalid token" });
        }

        const user = await Login.findOne({ username: decoded });
        if (user == null) {
            return res.status(404).json({ error: "User not Found" });
        }
        req.user = user;
        next();
    });
}

const checkVolunteer = async (req, res, next) => {
    if (req.user.role !== 'volunteer') {
        return res.status(400).json({ error: "Invalid role" });
    }

    const volunteer = await Volunteer.findById(req.user.id);
    if (volunteer == null) {
        return res.status(404).json({ error: "User not Found" });
    }

    req.volunteer = volunteer;
    next();
}

const checkCampaignForRequest = async (req, res, next) => {
    const campaignId = req.params.campaign_id;
    if (!campaignId) {
        return res.status(400).json({ error: "Campaign Id is missing" });
    }

    const request = await Request.findOne({ campaign_id: ObjectId(campaignId), volunteer_id: ObjectId(req.volunteer._id) });
    if (request == null) {
        return res.status(404).json({ error: "Request does not exist" });
    }
    
    const campaign = await request.populate("campaign");
    if (campaign == null) {
        return res.status(404).json({ error: "Campaign does not exist" })
    }
    if (campaign.assigned_to !== null && !campaign.assigned_to.equals(req.volunteer._id)) {
        return res.status(403).json({ error: "Campaign assigned to another volunteer" });
    }

    req.campaignId = campaignId;
    req.request = request;
    req.campaign = campaign;
    next();
}

const checkCampaignForWork = async (req, res, next) => {
    const campaignId = req.params.campaign_id;
    if (!campaignId) {
        return res.status(400).json({ error: "Campaign Id is missing" });
    }

    const campaign = await Campaign.findById(campaignId);
    if (campaign == null) {
        return res.status(404).json({ error: "Campaign does not exist" })
    }
    if (!campaign.assigned_to.equals(req.volunteer._id)) {
        return res.status(403).json({ error: "Campaign assigned to another volunteer" });
    }

    req.campaignId = campaignId;
    req.campaign = campaign;
    next();
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

    for (let request of await Request.find({ volunteer_id: req.volunteer._id, assigned: false })) {
        const assignedCampaign = await request.populate("campaign");
        if(assignedCampaign.assigned_to == null) {
            newRequests.push({ id: request.campaign_id.toString(), name: (await assignedCampaign.populate("campaigner")).name, campaigner_updated: request.campaigner_updated })
        } else {
            Request.deleteOne({ volunteer_id: req.volunteer._id })
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
    req.request.save();
})

app.patch("/volunteer/request/view/:campaign_id", authenticate, checkVolunteer, checkCampaignForRequest, async (req, res) => {
    const { requirements, assigned } = req.body;
    if (requirements == null || assigned == null) {
        return res.status(400).json({ error: "One or more fields are missing" });
    }

    if (req.request.assigned === false) {
        if (assigned === true) {
            if (req.request.volunteer_updated === false) {
                req.campaign.assigned_to = req.volunteer._id;
                req.request.assigned = true;
                return res.status(200).send();
            } else {
                return res.status(401).json({ error: "You cannot accept a request you just edited" })
            }
        } else {
            req.request.requirements = requirements;
            return res.status(200).send();
        }
    } else {
        return res.status(401).json({ error: "You cannot change a accepted request" })
    }
})

app.delete("/volunteer/request/view/:campaign_id", authenticate, checkVolunteer, checkCampaignForRequest, async (req, res) => {
    if (req.request.assigned !== true) {
        req.request.deleteOne();
        return res.status(200).send()
    } else {
        return res.status(401).json({ error: "You cannot delete a accepted request" })
    }
})

app.post("/volunteer/request/view/:campaign_id", authenticate, checkVolunteer, async (req, res) => {
    const campaignId = req.params.campaign_id;
    if (!campaignId) {
        return res.status(400).json({ error: "Campaign Id is missing" });
    }

    const request = await Request.findOne({ campaign_id: ObjectId(campaignId), volunteer_id: req.volunteer._id });
    if (request !== null) {
        return res.status(400).json({ error: "Request already exists" });
    }

    const { requirements } = req.body;
    await Request.create({ campaign_id: ObjectId(campaignId), volunteer_id: req.volunteer._id, requirements: requirements, volunteer_updated: true})
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

    if(req.campaign.completion_percent > completion_percent) {
        return res.status(400).json({ error: "Completion percentage cannot be decreased" });
    }

    if(completion_percent > 100) {
        return res.status(400).json({ error: "Completion percentage should be less than or equal to 100" });
    }

    await Campaign.updateOne({ _id: req.campaign._id }, { $set: { completion_percent: completion_percent } });
    
    if(completion_percent === 100) {
        await Volunteer.updateOne({ _id: req.volunteer._id }, { $inc: { campaigns_completed: 1 } });
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




startServer()