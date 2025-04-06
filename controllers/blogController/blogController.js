const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ApiError } = require("../../utils/error/ApiError");
const expressAsyncHandler = require('express-async-handler');
const status = require("http-status");


//creating a new Blog Post
const createBlog = expressAsyncHandler(async (req, res, next) => {
  const { title, content } = req.body;
  const authorId = req.user.id;

  try {
    const blog = await prisma.blog.create({
      data: { title, content, authorId }
    });
    res.status(201).json(blog);
  } catch (error) {
    next(new ApiError(status.INTERNAL_SERVER_ERROR, "Failed to create blog", error));
  }
});

//Fetching all the approved blogs
const getAllBlogs = expressAsyncHandler(async (req, res, next) => {
  try {
    const blogs = await prisma.blog.findMany({
      where: { status: "approved" },
      include: { author: true, reactions: true, comments: true }
    });
    res.json(blogs);
  } catch (error) {
    next(new ApiError(status.INTERNAL_SERVER_ERROR, "Failed to fetch blogs", error));
  }
});

//Approve or reject a blog 
const approveBlog = expressAsyncHandler(async (req, res, next) => {
  const { blogId, status, feedback } = req.body;
  const approverId = req.user.id;
  const allowedRoles = ["ADMIN", "PRESIDENT", "VICEPRESIDENT", "DIRECTOR_TECHNICAL", "DIRECTOR_MARKETING"];
  
  if (!allowedRoles.includes(req.user.access)) {
    return next(new ApiError(status.UNAUTHORIZED, "Access Denied"));
  }

  try {
    const approval = await prisma.blogApproval.create({
      data: { blogId, approverId, status, feedback }
    });

    await prisma.blog.update({ where: { id: blogId }, data: { status } });
    res.json({ message: "Blog updated", approval });
  } catch (error) {
    next(new ApiError(status.INTERNAL_SERVER_ERROR, "Failed to update blog", error));
  }
});

// Fetch a specific blog by ID (/api/blog/<blogId>)
const getBlogById = expressAsyncHandler(async (req, res, next) => {
  const { blogId } = req.params;

  try {
    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      include: { author: true, reactions: true, comments: true }
    });

    if (!blog) {
      return next(new ApiError(status.NOT_FOUND, "Blog not found"));
    }

    res.json(blog);
  } catch (error) {
    next(new ApiError(status.INTERNAL_SERVER_ERROR, "Failed to fetch blog", error));
  }
});

// edit a blog by id (/api/blog/edit/<blogId>)
const editBlog = expressAsyncHandler(async (req, res, next) => {
  const { blogId } = req.params;
  const { title, content } = req.body;
  const userId = req.user.id;

  try {
    const blog = await prisma.blog.findUnique({ where: { id: blogId } });

    if (!blog || blog.authorId !== userId) {
      return next(new ApiError(status.FORBIDDEN, "You are not authorized to edit this blog"));
    }

    const updatedBlog = await prisma.blog.update({
      where: { id: blogId },
      data: { title, content }
    });

    res.json(updatedBlog);
  } catch (error) {
    next(new ApiError(status.INTERNAL_SERVER_ERROR, "Failed to edit blog", error));
  }
});

// delete a blog by id (/api/blog/delete/<blogId)
const deleteBlog = expressAsyncHandler(async (req, res, next) => {
  const { blogId } = req.params;
  const userId = req.user.id;

  if (!blogId) {
      return next(new ApiError(400, "Blog ID is required"));
  }

  try {
      const blog = await prisma.blog.findUnique({ where: { id: blogId } });
      if (!blog) {
          return next(new ApiError(404, "Blog not found"));
      }

      if (blog.authorId !== userId) {
          return next(new ApiError(403, "You are not authorized to delete this blog"));
      }

      await prisma.blogApproval.deleteMany({ where: { blogId: blogId } });
      await prisma.blog.delete({ where: { id: blogId } });

      res.status(200).json({
          success: true,
          message: "Blog deleted successfully"
      });
  } catch (error) {
      next(new ApiError(500, "Failed to delete blog", error.message));
  }
});

// Like a blog (/api/blog/like/:<blogId>)
const likeBlog = expressAsyncHandler(async (req, res, next) => {
  const { blogId } = req.params;
  const userId = req.user.id;

  try {
    const existingLike = await prisma.blogReaction.findFirst({
      where: { blogId, userId, reaction: "like" }  // Fixed model name and field name
    });

    if (existingLike) {
      return next(new ApiError(400, "You have already liked this blog"));
    }

    const like = await prisma.blogReaction.create({
      data: { blogId, userId, reaction: "like" }  // Fixed model name and field name
    });

    res.json({ message: "Blog liked successfully", like });
  } catch (error) {
    next(new ApiError(500, "Failed to like blog", error.message));
  }
});

// Comment on a blog (/api/blog/comment/<blogId>)
const commentOnBlog = expressAsyncHandler(async (req, res, next) => {
  const { blogId } = req.params;
  const { content } = req.body;  // Change 'comment' to 'content'
  const userId = req.user.id;

  try {
    if (!content || typeof content !== 'string' || content.trim() === "") {
      return next(new ApiError(status.BAD_REQUEST, "Comment content cannot be empty"));
    }

    const newComment = await prisma.blogComment.create({
      data: { 
        blogId, 
        userId, 
        content  // Save 'content' instead of 'comment'
      }
    });

    res.json({
      success: true,
      message: "Comment added successfully",
      comment: newComment
    });
  } catch (error) {
    next(new ApiError(status.INTERNAL_SERVER_ERROR, "Failed to comment on blog", error.message));
  }
});

module.exports = {
  createBlog,
  getAllBlogs,
  approveBlog,
  getBlogById,
  editBlog,
  deleteBlog,
  likeBlog,
  commentOnBlog
};
