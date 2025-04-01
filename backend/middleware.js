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
    
    const campaign = (await request.populate("campaign")).campaign;
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

const checkCampaigner = async (req, res, next) => {
    if (req.user.role !== 'campaigner') {
        return res.status(400).json({ error: "Invalid role" });
    }

    const campaigner = await Campaigner.findById(req.user.id);
    if (campaigner == null) {
        return res.status(404).json({ error: "User not Found" });
    }

    req.campaigner = campaigner;
    next();
}

export default {
    authenticate,
    checkVolunteer,
    checkCampaignForRequest,
    checkCampaignForWork,
    checkCampaigner,
}