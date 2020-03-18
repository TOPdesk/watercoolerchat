import Koa from 'koa';
import send from 'koa-send';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import uuid from 'uuid';
import { createReadStream } from 'fs';

const router = Router();

const port = process.env.PORT || 3000;
const app = new Koa();

const queue = {};
const matchRequests = [];
const matches = {};

const ensureQueueExistsForCompany = companyName => {
    if (!queue[companyName]) {
        queue[companyName] = [];
    }
}

const handleCompany = async (ctx, next) => {
    const companyName = ctx.params.companyName
    if (!companyName) {
        ctx.throw(400, 'companyName empty');
    }

    ensureQueueExistsForCompany(companyName);

    ctx.type = "html";
    ctx.body = createReadStream("public/company.html");
}

const logState = () => {
    console.log("Queue:");
    console.log(queue);
    console.log("MatchRequests:");
    console.log(matchRequests);
    console.log("Matches:");
    console.log(matches);
    console.log("\n\n");
}

const addToQueue = async ctx => {
    const userName = ctx.request.body.userName;
    const companyName = ctx.request.body.companyName;
    const matchId = uuid.v4();
    
    ensureQueueExistsForCompany(companyName);

    matchRequests[matchId] = {
        initialRequestDate: Date.now(),
        lastRequestDate: Date.now(),
        userName: userName,
        companyName: companyName
    }
    queue[companyName].push(matchId);

    logState();

    ctx.response.type = "json";
    ctx.response.body = JSON.stringify({
        matchId: matchId,
        userName: userName,
        companyName: companyName
    });
}

const takeMatch = (companyName, matchId) => {
    const companyQueue = queue[companyName] ? queue[companyName] : [];
    const queuedMatchIds = companyQueue.filter(queuedMatchId => queuedMatchId != matchId);
    if (queuedMatchIds.length == 0) {
        return null;
    }
    const firstQueuedMatchId = queuedMatchIds[0];
    queue[companyName] = queue[companyName].filter(queuedMatchId => ![matchId, firstQueuedMatchId].includes(queuedMatchId));
    return firstQueuedMatchId;
}

const getCompanyName = matchId => {
    return matchRequests[matchId] ? matchRequests[matchId].companyName : undefined;
}

const generateTalkyUrl = companyName => {
    return `https://talky.io/${companyName}-${uuid.v4().substring(0, 8)}`;
}

const findMatch = async ctx => {
    const myMatchId = ctx.params.matchId;
    if (!matchRequests.hasOwnProperty(myMatchId)) {
        ctx.throw(400, 'matchId unknown');
    }

    const companyName = getCompanyName(myMatchId);

    let matchResult = "searching";
    let chatUrl = "";
    let chatPartner = "";

    if (matches.hasOwnProperty(myMatchId)) {
        matchResult = "found";
        chatUrl = matches[myMatchId].chatUrl;
        chatPartner = matches[myMatchId].chatPartner;
        delete matches[myMatchId];
        delete matchRequests[myMatchId];
    }
    else {
        const foundMatchId = takeMatch(companyName, myMatchId);
        if (foundMatchId) {
            matchResult = "found";
            chatUrl = generateTalkyUrl(companyName);
            chatPartner = matchRequests[foundMatchId].userName;
            const myName = matchRequests[myMatchId].userName;
            matches[foundMatchId] = {
                matchId: myMatchId,
                chatUrl: chatUrl,
                chatPartner: myName
            };
            delete matchRequests[myMatchId];
            logState();
        }
        else {
            matchRequests[myMatchId].lastRequestDate = Date.now();
        }
    }
    
    ctx.response.body = JSON.stringify({
        matchResult: matchResult,
        chatUrl: chatUrl,
        chatPartner: chatPartner
    });
}

router.get('/at/:companyName', handleCompany);
router.put('/api/queue', addToQueue);
router.post('/api/match/:matchId', findMatch);

app.use(bodyParser());

app.use(async (ctx, next) => {
    const path = ctx.path === "/" ? "/index.html" : ctx.path;
    if (["/index.html", "/style.css", "/watercooler.svg", "/watercoolerchat.js", "/watercoolerchat-home.js"].includes(path)) {
        await send(ctx, path, { root: process.cwd() + '/public' });
    }
    await next();
});

app.use(router.routes());

app.listen(port, () => console.log(`watercoolerchat available on port ${port}`));
