import mongoose from "mongoose"

const repositoryschema=new mongoose.Schema(
    {
        fullname:
        {
            type:String,
            required:true
        },
        owner:
        {
            type:String,
            required:true 
        },
        repo:
        {
            type:String,
            required:true 
        },
        createdat:
        {
            type:Date,
            default:Date.now 
        },
        lastsubmittedat:
        {
            type:Date,
            default:Date.now
        }
    }
);

repositoryschema.index(
    {
        fullname:1
    },
    {
        unique:true 
    }
);
const Repository=mongoose.model("Repository",repositoryschema,"repositories")


export default Repository
