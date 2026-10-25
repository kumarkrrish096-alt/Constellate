import mongoose from "mongoose";

const submissionschema = new mongoose.Schema({
  userid: 
  {
    type: String,
    required: true,
  },
  fullname: 
  {
    type: String,
    required: true,
  },
  sha: 
  {
    type: String,
    required: true,
  },
  jobid: 
  {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  createdat: 
  {
    type: Date,
    default: Date.now,
  },
});

submissionschema.index({ userid: 1, fullname: 1, sha: 1 }, { unique: true });
submissionschema.index({ userid: 1, createdat: -1 });

const Submission = mongoose.model("Submission", submissionschema, "submissions");

export default Submission;