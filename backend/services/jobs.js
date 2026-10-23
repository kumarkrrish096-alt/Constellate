import Job from "../models/job.js";

import Repository from "../models/repository.js"

import Snapshot from "../models/snapshot.js";

export async function findsnapshot(fullname,sha)
{
    return await  Snapshot.findone({fullname,sha}).lean();
};

export async function saverepository(fullname,owner,repo)
{
    await repository.updateone(
        {
            fullname 
        },
        {
            $setOnInsert:
            {
                owner,
                repo,
                createdat:Date.now
            },
            $set:
            {
                lastsubmiitedat:Date.now()
            }
        },
        {
            upsert:true
        }

    );
}

export async function createorgetajob(fullname,sha,branch)
{
    const filter = { fullname, sha };

  try {
    const result = await Job.updateOne(
        filter,
        {
            $setOnInsert: 
            {
                branch,
                status: "queued",
                attempts: 0,
                createdat: new Date(),
            },
        },
        { 
            upsert: true 
        }
    );

    const job = await Job.findOne(filter).lean();

    return { job, created: result.upsertedCount === 1 };
  } 
  catch (error) {
    if (error.code === 11000) {
      const job = await Job.findOne(filter).lean();
      return { job, created: false };
    }
    throw error;
  }
}