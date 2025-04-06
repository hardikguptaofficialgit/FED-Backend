const express = require("express");
const router = express.Router();
const blogController = require("../../../controllers/blogController/blogController");
const { verifyToken } = require("../../../middleware/verifyToken");
const { checkAccess } = require("../../../middleware/access/checkAccess");
const { checkBlogApprovalAccess, checkBlogAuthor } = require("../../../middleware/access/checkBlogAccess");

router.post("/create", verifyToken, checkAccess("USER"), blogController.createBlog);


router.get("/all", blogController.getAllBlogs);


router.post("/approve", verifyToken, checkBlogApprovalAccess, blogController.approveBlog);

router.get("/:blogId", blogController.getBlogById);

router.put("/edit/:blogId", verifyToken, checkBlogAuthor, blogController.editBlog);
router.delete("/delete/:blogId", verifyToken, checkBlogAuthor, blogController.deleteBlog);

router.post("/like/:blogId", verifyToken, blogController.likeBlog);
router.post("/comment/:blogId", verifyToken, blogController.commentOnBlog);


module.exports = router;
