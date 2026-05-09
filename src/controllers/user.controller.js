import { asyncHandler } from "../utils/asyncHandler.js"
import { apiError } from "../utils/apiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { apiRespons } from "../utils/apiRespons.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"


const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken
        await user.save({ validatBeforeSave: false })

        return { refreshToken, accessToken }

    } catch (error) {
        throw new apiError(500, "something went wrong while generating refresh and access token")
    }
}

const registerUser = asyncHandler(async (req, res) => {

    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

    const { username, fullname, email, password } = req.body
    console.log("email : ", email);

    if
        (
        [username, fullname, email, password].some((field) => field?.trim() === "")
    ) {
        throw new apiError(400, "all fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (existedUser) {
        throw new apiError(409, "User with this email or username already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    // let coverImageLocalPath;
    // if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
    //     coverImageLocalPath = req.files.coverImage[0].path
    // }

    if (!avatarLocalPath) {
        throw new apiError(400, "Avatar file is required !")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);


    let coverImage;
    if (coverImageLocalPath) {
        coverImage = await uploadOnCloudinary(coverImageLocalPath);
    }

    if (!avatar) {
        throw new apiError(400, "Avatar file is required !")
    }

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshtoken"
    )

    if (!createdUser) {
        throw new apiError(500, "something went wrong. in User creation")
    }

    return res.status(201).json(
        new apiRespons(200, createdUser, "User registered Successfully")
    )


})

const loginUser = asyncHandler(async (req, res) => {
    // req body --> data
    // username or email
    // find the user
    // check the password
    // access and refresh token
    // send cookie

    const { username, email, password } = req.body
    if (!username && !email) {
        throw new apiError(400, "username or email is required !")
    }

    const user = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (!user) {
        throw new apiError(404, "User does not exist")
    }

    const isPasswordVaild = await user.isPasswordCorrect(password);
    if (!isPasswordVaild) {
        throw new apiError(401, "inValid user password")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new apiError(
                200,
                {
                    user: loggedInUser, accessToken, refreshToken
                },
                "User logged in Successfully"
            )
        )

})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new apiRespons(200, {}, "User logged out"))

})

const refreshAccessToken = asyncHandler(async(req, res) => {
    const inComingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!inComingRefreshToken){
        throw new apiError(401, "unAuthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            inComingRefreshToken,
            proccess.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user){
            throw new apiError(401, "Invalid refresh token")
        }
    
        if (inComingRefreshToken !== user?.refreshToken) {
            throw new apiError(401, "refresh token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("refreshToken", newRefreshToken, options)
        .cookie("accessToken", accessToken, options)
        .json(
            new apiRespons(
                200,
                {
                    accessToken,
                    refreshToken: newRefreshToken
                },
                "access token refreshed"
            )
        )
    } catch (error) {
        throw new apiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect){
        throw new apiError(400, "Invalid Old Password");
    }
    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new apiRespons(200, {}, "Password Changed Successfully"))
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(200, req.user, "User fetched Successfully");

})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullname, email} = req.body
    if(!fullname || !email) {
        throw new apiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email: email
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new apiRespons(200, user, "Account details updated successfully"))

})

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.files$.path
    if(!avatarLocalPath) {
        throw new apiError(400, "Avatar file is missing")
    }

    const avatar = uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url) {
        throw new apiError(400, "Error while uploading avatar")
    }

    const user = await User.findByIdAndUpdate(
        res.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new apiRespons(200, "Avatar Image updated Successfully")
    )
})

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.files$.path
    if(!coverImageLocalPath) {
        throw new apiError(400, "Cover image file is missing")
    }

    const coverImage = uploadOnCloudinary(coverImageLocalPath)
    if(!coverImage.url) {
        throw new apiError(400, "Error while uploading cover Image")
    }

    const user = await User.findByIdAndUpdate(
        res.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new apiRespons(200, "Cover Image updated Successfully")
    )
})

const getUserChannelProfile = asyncHandler(async(req,res) => {
    const {username} = req.params
    if(!username?.trim()){
        throw new apiError(400, "username is missing")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "Subscription",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "Subscription",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                subscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]}
                    }
                }
            }
        },
        {
            $project: {
                fullname: 1,
                username: 1,
                subscribersCount: 1,
                subscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])

    if(!channel?.length){
        throw new apiError(404, "Channel not exists")
    }

    return res
    .status(200)
    .json(
        new apiRespons(200, channel[0], "user channel fetched successfuly")
    )
})

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "Videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new apiRespons(
            200,
            user[0].watchHistory,
            "Watch History fetched successfully"
        )
    )
})




export { 
    registerUser,
    loginUser ,
    logoutUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getWatchHistory
}