import mongoose from "mongoose"

const jobschema=new mongoose.Schema(
{
    fullname:
    {
        type:String,
        required:true
    },
    sha:
    {
        type:String,
        required:true
    },
    branch:
    {
        type:String
    },
    status:
    {
        type:String,
        enum:["queued","running","done","failed"],
        default:"queued"
    },
    // what the worker is doing right now, e.g. "cloning", "parsing", "building graph"
    stage:
    {
        type:String,
        default:"queued"
    },
    // 0 to 100, shown as the progress bar
    progress:
    {
        type:Number,
        default:0,
        min:0,
        max:100
    },
    // message shown to the user when status is "failed"
    error:
    {
        type:String,
        default:null
    },
    attempts:
    {
        type:Number,
        default:0
    },
    // lock lease: the worker that claimed the job owns it until lockeduntil,
    // and must renew it; if the worker crashes the lease runs out and another worker takes over
    workerid:
    {
        type:String,
        default:null
    },
    lockeduntil:
    {
        type:Date,
        default:null
    },
    // earliest time a worker may (re)try the job, used for retry back-off
    nextrunat:
    {
        type:Date,
        default:Date.now
    },
    createdat:
    {
        type:Date,
        default:Date.now
    },
    startedat:
    {
        type:Date,
        default:null
    },
    finishedat:
    {
        type:Date,
        default:null
    },
    // bumped on every change, so the progress stream knows when to send an update
    updatedat:
    {
        type:Date,
        default:Date.now
    }

});

jobschema.index({fullname:1,sha:1},{unique:true});

jobschema.index({status:1,createdat:1});

// queue order: workers claim the queued job with the earliest nextrunat,
// and queue position counts the queued jobs ahead of it in that order
jobschema.index({status:1,nextrunat:1});

// crash recovery: running jobs whose lease ran out
jobschema.index({status:1,lockeduntil:1});

const Job=mongoose.model("Job",jobschema,"jobs");

export default Job;
