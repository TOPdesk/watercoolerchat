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
    FOUND: "found"
}

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
        userName: userName,
        companyName: companyName,
        chatPartnerId: "",
        chatPartnerName: "",
        chatUrl: ""
    }
    
    logState();

    ctx.response.type = "json";
    ctx.response.body = JSON.stringify({
        queueId: queueId,
        userName: userName,
        companyName: companyName
    });
}

const takeMatch = (companyName, queueId) => {
    const potentialChatPartners = Object.values(queue).filter(potentialChatPartner => 
            potentialChatPartner.companyName === companyName &&
            potentialChatPartner.state !== QUEUE_STATE.FOUND &&
            potentialChatPartner.queueId !== queueId);
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
    
    let resultState = "";
    let resultChatUrl = "";
    let resultChatPartnerName = "";

    switch (me.state) {
        case QUEUE_STATE.SEARCHING:
            const potentialChatPartner = takeMatch(me.companyName, myQueueId);
            
            if (potentialChatPartner) {
                const chatUrl = generateTalkyUrl(me.companyName);
                me.state = QUEUE_STATE.FOUND;
                me.chatPartnerId = potentialChatPartner.queueId;
                me.chatPartnerName = potentialChatPartner.userName;
                me.chatUrl = chatUrl;

                potentialChatPartner.state = QUEUE_STATE.FOUND;
                potentialChatPartner.chatPartnerId = me.queueId;
                potentialChatPartner.chatPartnerName = me.userName;
                potentialChatPartner.chatUrl = chatUrl;

                resultState = QUEUE_STATE.SEARCHING,
                resultChatUrl = me.chatUrl,
                resultChatPartnerName = me.chatPartnerName

                logState();
            }
            else {
                me.lastRequestDate = Date.now();
            }
            break;
            
        case QUEUE_STATE.FOUND:
            resultState = QUEUE_STATE.FOUND,
            resultChatUrl = me.chatUrl,
            resultChatPartnerName = me.chatPartnerName

            delete queue[myQueueId];
            logState();
            break;
    }

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
