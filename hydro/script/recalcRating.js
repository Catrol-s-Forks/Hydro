/* eslint-disable no-await-in-loop */
const domain = require('../model/domain');
const contest = require('../model/contest');
const user = require('../model/user');
const rating = require('../lib/rating');
const { STATUS } = require('../model/builtin');

async function run({ domainId, isSub = false }, report) {
    if (!domainId) {
        const domains = await domain.getMulti().toArray();
        await report({ message: `Found ${domains.length} domains` });
        for (const i in domains) {
            const start = new Date().getTime();
            await run({ domainId: domains[i]._id, isSub: true }, report);
            await report({
                case: {
                    status: STATUS.STATUS_ACCEPTED,
                    judgeText: `Domain ${i} finished`,
                    time_ms: new Date().getTime() - start,
                    memory_kb: 0,
                    score: 0,
                },
                progress: Math.floor(((parseInt(i) + 1) / domains.length) * 100),
            });
        }
        return true;
    }
    await user.setMultiInDomain(domainId, {}, { rating: 1500 });
    const contests = await contest.getMulti(domainId, { rated: true }).sort('endAt', -1).toArray();
    await report({ message: `Found ${contests.length} contests in ${domainId}` });
    const udict = {};
    for (const i in contests) {
        const start = new Date().getTime();
        const tdoc = contests[i];
        const tsdocs = await contest.getMultiStatus(domainId, { docId: tdoc.docId })
            .sort(contest.RULES[tdoc.rule].statusSort).toArray();
        const rankedTsdocs = contest.RULES[tdoc.rule].rank(tsdocs);
        const users = [];
        for (const result of rankedTsdocs) {
            users.push({ ...result[1], rank: result[0], old: udict[result[1].uid] || 1500 });
        }
        const rated = rating(users);
        for (const udoc of rated) {
            udict[udoc.uid] = udoc.new;
        }
        if (!isSub) {
            await report({ progress: Math.floor(((parseInt(i) + 1) / contests.length) * 100) });
        }
        await report({
            case: {
                status: STATUS.STATUS_ACCEPTED,
                judgeText: `Contest ${tdoc.title} finished`,
                time_ms: new Date().getTime() - start,
                memory_kb: 0,
                score: 0,
            },
        });
    }
    const tasks = [];
    for (const uid in udict) {
        tasks.push(user.setInDomain(domainId, parseInt(uid), { rating: udict[uid] }));
    }
    await Promise.all(tasks);
    return true;
}

global.Hydro.script.recalcRating = module.exports = { run };
