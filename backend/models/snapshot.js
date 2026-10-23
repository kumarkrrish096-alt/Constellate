import mongoose from "mongoose"

const snapshotschema=new mongoose.Schema(
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
        filepath:
        {
            type:String,
            required:true 
        },
        createdat:
        {
            type:Date,
            default:Date.now
        }
    });

    snapshotschema.index({fullname:1,sha:1},{unique:true});

    const Snapshot=mongoose.model("Snapshot",snapshotschema,"snapshots");

    export default Snapshot;