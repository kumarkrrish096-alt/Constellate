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

    attempts:
    {
        type:Number,
        default:0
    },
    createdat:
    {
        type:Date,
        default:Date.now
    }

});

jobschema.index({fullname:1,sha:1},{unique:true});

jobschema.index({status:1,createdat:1});

const Job=mongoose.model("Job",jobschema,"jobs");

export default Job;

