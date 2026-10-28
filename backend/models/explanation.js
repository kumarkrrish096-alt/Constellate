import mongoose from "mongoose";

const explanationschema = new mongoose.Schema(
  {
    fullname: { type: String, required: true },
    sha: { type: String, required: true },
    filepath: { type: String, required: true },
    functionname: { type: String, default: null },
    functionline: { type: Number, default: null },
    analysisversion: { type: Number, required: true },
    promptversion: { type: String, required: true },
    model: { type: String, required: true },
    questionhash: { type: String, default: null },
    explanation: { type: mongoose.Schema.Types.Mixed, required: true },
    generatedat: { type: Date, default: Date.now },
  },
  { minimize: false },
);

explanationschema.index(
  {
    fullname: 1,
    sha: 1,
    filepath: 1,
    functionname: 1,
    functionline: 1,
    analysisversion: 1,
    promptversion: 1,
    model: 1,
    questionhash: 1,
  },
  { unique: true },
);

const Explanation = mongoose.model("Explanation", explanationschema, "explanations");

export default Explanation;