import mongoose from "mongoose"

import Job from "../models/job.js"

import Repository from "../models/repository.js"

import  Snapshot from "../models/snapshot.js"

export async function connectdb(){
    await mongoose.connect(process.env.MONGODB_URI,{
        dbName:process.env.DB_NAME
    })



    await Promise.all( [ Repository.init() , Job.init() , Snapshot.init() ] )

    console.log("connected to mongodb");
}