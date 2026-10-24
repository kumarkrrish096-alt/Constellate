import mongoose from "mongoose"

import Job from "../models/job.js"

import Repository from "../models/repository.js"

import  Snapshot from "../models/snapshot.js"

import Session from "../models/session.js"

import User from "../models/user.js"

export async function connectdb(){
    await mongoose.connect(process.env.MONGODB_URI,{
        dbName:process.env.DB_NAME
    })



    await Promise.all( [ Repository.init() , Job.init() , Snapshot.init() , User.init() , Session.init() ] )

    console.log("connected to mongodb");
}