const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    bio: {
        type: String,
        default: "Welcome to my SocialConnect profile!"
    },
    profileImage: {
    type: String,
    default: ""
},

    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],

    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]
});

module.exports = mongoose.model("User", userSchema);