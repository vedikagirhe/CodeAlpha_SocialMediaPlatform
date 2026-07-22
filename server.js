require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const multer = require("multer");

const User = require("./models/User");
const Post = require("./models/Post");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "public/uploads/");
    },

    filename: function (req, file, cb) {
        cb(
            null,
            Date.now() + path.extname(file.originalname)
        );
    }
});

const upload = multer({ storage: storage });

const app = express();
const PORT = 3000;

/* DATABASE CONNECTION */

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB Connected Successfully");
    })
    .catch((error) => {
        console.log("MongoDB Connection Error:", error.message);
    });

/* APP SETTINGS */

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || "socialconnect-secret-key",
    resave: false,
    saveUninitialized: false
}));

/* AUTH MIDDLEWARE */

function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }

    res.redirect("/");
}

/* LOGIN PAGE */

app.get("/", (req, res) => {
    if (req.session.userId) {
        return res.redirect("/home");
    }

    res.render("login", { error: null });
});

/* REGISTER PAGE */

app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

/* REGISTER USER */

app.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.render("register", {
                error: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            username,
            email,
            password: hashedPassword
        });

        await user.save();

        res.redirect("/");
    } catch (error) {
        res.render("register", {
            error: "Registration failed"
        });
    }
});

/* LOGIN USER */

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.render("login", {
                error: "Invalid email or password"
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.render("login", {
                error: "Invalid email or password"
            });
        }

        req.session.userId = user._id;

        res.redirect("/home");

    } catch (error) {
        res.render("login", {
            error: "Login failed"
        });
    }
});

/* HOME PAGE */

app.get("/home", isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        const posts = await Post.find()
            .populate("user")
            .sort({ createdAt: -1 });

        const users = await User.find({
            _id: { $ne: req.session.userId }
        });

        res.render("home", {
            user,
            posts,
            users
        });

    } catch (error) {
        res.send("Unable to load home page");
    }
});

/* CREATE POST */

app.post(
    "/post",
    isAuthenticated,
    upload.single("postImage"),
    async (req, res) => {
        try {
            const { content } = req.body;

            if (!content || !content.trim()) {
                return res.redirect("/home");
            }

            const post = new Post({
                user: req.session.userId,
                content: content,
                image: req.file
                    ? "/uploads/" + req.file.filename
                    : ""
            });

            await post.save();

            res.redirect("/home");

        } catch (error) {
            console.log(error);
            res.send("Unable to create post");
        }
    }
);
/* DELETE POST */

app.post("/delete-post/:id", isAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.redirect("/home");
        }

        if (
            post.user.toString() !==
            req.session.userId.toString()
        ) {
            return res.status(403).send(
                "You cannot delete this post"
            );
        }

        await Post.findByIdAndDelete(req.params.id);

        res.redirect("/home");

    } catch (error) {
        res.send("Unable to delete post");
    }
});

/* LIKE POST */

app.post("/like/:id", isAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        const userId = req.session.userId;

        if (!post) {
            return res.redirect("/home");
        }

        const liked = post.likes.some(
            id => id.toString() === userId.toString()
        );

        if (liked) {
            post.likes.pull(userId);
        } else {
            post.likes.push(userId);
        }

        await post.save();

        res.redirect("/home");

    } catch (error) {
        res.send("Unable to like post");
    }
});

/* COMMENT */

app.post("/comment/:id", isAuthenticated, async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.redirect("/home");
        }

        const user = await User.findById(req.session.userId);
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.redirect("/home");
        }

        post.comments.push({
            user: user._id,
            username: user.username,
            text: text.trim()
        });

        await post.save();

        res.redirect("/home");

    } catch (error) {
        res.send("Unable to add comment");
    }
});

/* PROFILE PAGE */

app.get("/profile/:id", isAuthenticated, async (req, res) => {
    try {
        const profileUser = await User.findById(req.params.id);

        if (!profileUser) {
            return res.send("Profile not found");
        }

        const currentUser = await User.findById(
            req.session.userId
        );

        const posts = await Post.find({
            user: profileUser._id
        }).sort({ createdAt: -1 });

        res.render("profile", {
            profileUser,
            currentUser,
            posts
        });

    } catch (error) {
        res.send("Profile not found");
    }
});

/* EDIT PROFILE PAGE */

app.get("/edit-profile", isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        res.render("edit-profile", {
            user,
            error: null
        });

    } catch (error) {
        res.send("Unable to load edit profile page");
    }
});

/* UPDATE PROFILE */

app.post(
    "/edit-profile",
    isAuthenticated,
    upload.single("profileImage"),
    async (req, res) => {
        try {
            const user = await User.findById(req.session.userId);

            const { username, bio } = req.body;

            user.username = username;
            user.bio = bio;

            if (req.file) {
                user.profileImage = "/uploads/" + req.file.filename;
            }

            await user.save();

            res.redirect(`/profile/${user._id}`);

        } catch (error) {
            console.log(error);
            res.redirect("/edit-profile");
        }
    }
);
/* FOLLOW USER */

app.post("/follow/:id", isAuthenticated, async (req, res) => {
    try {
        const currentUser = await User.findById(
            req.session.userId
        );

        const targetUser = await User.findById(req.params.id);

        if (!targetUser) {
            return res.redirect("/home");
        }

        if (
            currentUser._id.toString() ===
            targetUser._id.toString()
        ) {
            return res.redirect(
                `/profile/${targetUser._id}`
            );
        }

        const following = currentUser.following.some(
            id => id.toString() === targetUser._id.toString()
        );

        if (following) {
            currentUser.following.pull(targetUser._id);
            targetUser.followers.pull(currentUser._id);
        } else {
            currentUser.following.push(targetUser._id);
            targetUser.followers.push(currentUser._id);
        }

        await currentUser.save();
        await targetUser.save();

        res.redirect(`/profile/${targetUser._id}`);

    } catch (error) {
        res.send("Follow action failed");
    }
});

app.post("/delete-post/:id", isAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.redirect("/home");
        }

        if (post.user.toString() !== req.session.userId.toString()) {
            return res.send("You cannot delete this post");
        }

        await Post.findByIdAndDelete(req.params.id);

        res.redirect("/home");

    } catch (error) {
        res.send("Unable to delete post");
    }
});
app.get("/edit-post/:id", isAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.redirect("/home");
        }

        if (post.user.toString() !== req.session.userId.toString()) {
            return res.redirect("/home");
        }

        res.render("edit-post", { post });

    } catch (error) {
        res.send("Unable to edit post");
    }
});

app.post("/edit-post/:id", isAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        const { content } = req.body;

        if (!post) {
            return res.redirect("/home");
        }

        if (post.user.toString() !== req.session.userId.toString()) {
            return res.redirect("/home");
        }

        if (!content || !content.trim()) {
            return res.redirect(`/edit-post/${post._id}`);
        }

        post.content = content.trim();

        await post.save();

        res.redirect("/home");

    } catch (error) {
        res.send("Unable to update post");
    }
});
// OPEN EDIT POST PAGE
app.get("/edit-post/:id", isAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.redirect("/home");
        }

        if (post.user.toString() !== req.session.userId.toString()) {
            return res.redirect("/home");
        }

        res.render("edit-post", { post });

    } catch (error) {
        res.redirect("/home");
    }
});

/* LOGOUT */

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

/* START SERVER */

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});