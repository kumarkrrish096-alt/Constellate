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
        // ANALYSIS_VERSION that produced it; older versions are not cache hits
        version:
        {
            type:Number,
            default:0
        },
        // compressed size on disk
        sizebytes:
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

    snapshotschema.index({fullname:1,sha:1},{unique:true});

    const Snapshot=mongoose.model("Snapshot",snapshotschema,"snapshots");

    export default Snapshot;