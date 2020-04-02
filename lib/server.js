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

const QUEUE_STATE = {
    SEARCHING: "searching",
    POTENTIAL_MATCH: "potentialMatch",
    MATCH_ACKNOWLEDGED: "matchAcknowledged",
    FOUND: "found"
}

const MAX_TIME_WAITING_ON_POTENTIAL_MATCH_SECONDS = 11;

const handleCompany = async (ctx, next) => {
    const companyName = ctx.params.companyName
    if (!companyName) {
        ctx.throw(400, 'companyName empty');
    }

    ctx.type = "html";
    ctx.body = createReadStream("public/company.html");
}

const logState = () => {
    console.log("Queue:");
    console.log(queue);
    console.log("Matches:");
    console.log(Object.values(queue).filter(it => it.state === QUEUE_STATE.FOUND));
    console.log("\n\n");
}

const addToQueue = async ctx => {
    const userName = ctx.request.body.userName;
    const companyName = ctx.request.body.companyName;
    const queueId = uuid.v4();
    
    queue[queueId] = {
        queueId: queueId,
        state: QUEUE_STATE.SEARCHING,
        initialRequestDate: Date.now(),
        lastRequestDate: Date.now(),
        potentialMatchStartDate: null,
        userName: userName,
        companyName: companyName,
        chatPartnerId: null,
        chatPartnerName: null,
        chatUrl: null,
        failedMatches: []
    }
    
    logState();

    ctx.response.type = "json";
    ctx.response.body = JSON.stringify({
        queueId: queueId,
        userName: userName,
        companyName: companyName
    });
}

const findChatPartner = (companyName, queueId, failedMatches) => {
    const potentialChatPartners = Object.values(queue).filter(potentialChatPartner => 
            potentialChatPartner.companyName === companyName &&
            potentialChatPartner.state !== QUEUE_STATE.FOUND &&
            potentialChatPartner.queueId !== queueId &&
            !failedMatches.includes(potentialChatPartner.queueId));
    if (potentialChatPartners.length == 0) {
        return null;
    }
    return potentialChatPartners[0];
}

const generateTalkyUrl = companyName => {
    return `https://talky.io/${companyName}-${uuid.v4().substring(0, 8)}`;
}

const findMatch = async ctx => {
    const myQueueId = ctx.params.queueId;
    if (!queue.hasOwnProperty(myQueueId)) {
        ctx.throw(400, 'queueId unknown');
    }
    const me = queue[myQueueId];
    
    let resultState = QUEUE_STATE.SEARCHING;
    let resultChatUrl = me.chatUrl;
    let resultChatPartnerName = me.chatPartnerName;

    switch (me.state) {
        case QUEUE_STATE.SEARCHING:
            const potentialChatPartner = findChatPartner(me.companyName, me.queueId, me.failedMatches);
            
            if (potentialChatPartner) {
                const chatUrl = generateTalkyUrl(me.companyName);
                me.state = QUEUE_STATE.MATCH_ACKNOWLEDGED;
                me.chatPartnerId = potentialChatPartner.queueId;
                me.chatPartnerName = potentialChatPartner.userName;
                me.chatUrl = chatUrl;
                me.potentialMatchStartDate = Date.now();
                
                potentialChatPartner.state = QUEUE_STATE.POTENTIAL_MATCH;
                potentialChatPartner.chatPartnerId = me.queueId;
                potentialChatPartner.chatPartnerName = me.userName;
                potentialChatPartner.chatUrl = chatUrl;
                potentialChatPartner.potentialMatchStartDate = Date.now();

                resultState = QUEUE_STATE.SEARCHING,
                resultChatUrl = me.chatUrl,
                resultChatPartnerName = me.chatPartnerName
            }
            else {
                me.lastRequestDate = Date.now();
            }
            break;
        
        case QUEUE_STATE.POTENTIAL_MATCH:
            me.state = QUEUE_STATE.MATCH_ACKNOWLEDGED;
            break;

        case QUEUE_STATE.MATCH_ACKNOWLEDGED:
            const chatPartner = queue[me.chatPartnerId];
            console.log(`Waiting for ${Date.now()} > ${me.potentialMatchStartDate + MAX_TIME_WAITING_ON_POTENTIAL_MATCH_SECONDS}`);
            if (chatPartner) {
                if (chatPartner.state === QUEUE_STATE.MATCH_ACKNOWLEDGED) {
                    me.state = QUEUE_STATE.FOUND;
                    chatPartner.state = QUEUE_STATE.FOUND;
                }
                else if (Date.now() > me.potentialMatchStartDate + MAX_TIME_WAITING_ON_POTENTIAL_MATCH_SECONDS) {
                    // Our match did not acknowledge, go back to searching.
                    me.state = QUEUE_STATE.SEARCHING;
                    me.chatPartnerId = null;
                    me.chatPartnerName = null;
                    me.chatUrl = null;
                    me.potentialMatchStartDate = null;
                    me.failedMatches.push(chatPartner.queueId);

                    chatPartner.state = QUEUE_STATE.SEARCHING;
                    chatPartner.chatPartnerId = null;
                    chatPartner.chatPartnerName = null;
                    chatPartner.chatUrl = null;
                    chatPartner.potentialMatchStartDate = null;
                    chatPartner.failedMatches.push(me.queueId);
                    
                    resultChatUrl = me.chatUrl;
                    resultChatPartnerName = me.chatPartnerName;
                }
            }
            else {
                me.state = QUEUE_STATE.SEARCHING;
            }
            break;

        case QUEUE_STATE.FOUND:
            resultState = QUEUE_STATE.FOUND;
            delete queue[myQueueId];
            break;
    }

    logState();

    ctx.response.body = JSON.stringify({
        matchResult: resultState,
        chatUrl: resultChatUrl,
        chatPartner: resultChatPartnerName
    });
}

router.get('/at/:companyName', handleCompany);
router.put('/api/queue', addToQueue);
router.post('/api/match/:queueId', findMatch);

app.use(bodyParser());

app.use(async (ctx, next) => {
    const path = ctx.path === "/" ? "/index.html" : ctx.path;
    if (["/index.html", "/style.css", "/watercooler.svg", "/watercoolerchat.js", "/watercoolerchat-home.js", "/logo.png", "/favicon.ico"].includes(path)) {
        await send(ctx, path, { root: process.cwd() + '/public' });
    }
    await next();
});

app.use(router.routes());

app.listen(port, () => console.log(`watercoolerchat available on port ${port}`));
