const { ApiError } = require('../../utils/error/ApiError');
const { PrismaClient, AccessTypes } = require("@prisma/client");
const prisma = new PrismaClient();

const checkBlogApprovalAccess = async (req, res, next) => {
    try {
        const allowedRoles = [
            AccessTypes.PRESIDENT,
            AccessTypes.VICEPRESIDENT,
            AccessTypes.DIRECTOR_TECHNICAL,
            AccessTypes.DIRECTOR_CREATIVE,
            AccessTypes.DIRECTOR_MARKETING,
            AccessTypes.DIRECTOR_OPERATIONS,
            AccessTypes.DIRECTOR_PR_AND_FINANCE,
            AccessTypes.DIRECTOR_HUMAN_RESOURCE
        ];

        if (!req.user || !allowedRoles.includes(req.user.access)) {
            throw new ApiError(403, "You do not have permission to approve/reject blogs");
        }

        next();
    } catch (error) {
        console.error("Blog Approval Access Denied:", error);
        next(error instanceof ApiError ? error : new ApiError(500, "Internal Server Error", [], error));
    }
};

const checkBlogAuthor = async (req, res, next) => {
    try {
        const { blogId } = req.params;

        if (!blogId) {
            throw new ApiError(400, "Blog ID is required");
        }

        const blog = await prisma.blog.findUnique({ where: { id: blogId } });

        if (!blog) {
            throw new ApiError(404, "Blog not found");
        }

        if (blog.authorId !== req.user.id) {
            throw new ApiError(403, "You are not authorized to modify this blog");
        }

        next();
    } catch (error) {
        console.error("Blog Author Check Failed:", error);
        next(error instanceof ApiError ? error : new ApiError(500, "Internal Server Error", [], error));
    }
};

module.exports = { checkBlogApprovalAccess, checkBlogAuthor };
