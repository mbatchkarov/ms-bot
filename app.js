var nconf = require('nconf');
var request = require('request');
var restify = require('restify');
var builder = require('botbuilder');

var config = nconf.env().argv().file({file: 'localConfig.json'});

//=========================================================
// Utility functions
//=========================================================

function _askLUIS(appId, subKey, q) {
    var uri = `https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/${appId}?subscription-key=${subKey}&verbose=true&q=${q}`;

    return new Promise((resolve, reject) => {
        var options = {
            uri: uri,
            method: 'GET'
        };
        request(options, (err, response, body) => {
            resolve(JSON.parse(body));
        })
    })
}

function askLUIS(q) {
    return _askLUIS(config.get("LUIS_APP_ID"), config.get("LUIS_SUBSCRIPTION_KEY"), q);
}

let _intents = {
    createAlert : /start monitoring (.+)/
}

function askRegex(q) {

    var match;
    var intent = Object.keys(_intents).find(k => {
        var regex = _intents[k];
        return ((match = regex.exec(q)) != null);
    });

    return new Promise((resolve, reject) => {
        var _intent = 'None';
        if (intent) {
            _intent = intent;
        }
        resolve({
            topScoringIntent : {
                intent : _intent
            },
            entities : [
                {
                    entity : match[1],
                    type : "companyName"
                }
            ]
        });
    });
}

//=========================================================
// Intent Handlers
//=========================================================

function createAlert(session, msg) {
    session.send(msg);
}

//=========================================================
// Bot Setup
//=========================================================

function main() {

    // Setup Restify Server
    var server = restify.createServer();
    server.listen(process.env.port || process.env.PORT || 3978, '0.0.0.0', function () {
      console.log('%s listening to %s', server.name, server.url); 
    });
      
    // Create chat bot
    var connector = new builder.ChatConnector({
      appId: process.env.MICROSOFT_APP_ID,
      appPassword: process.env.MICROSOFT_APP_PASSWORD
    });

    //var connector = new builder.ConsoleConnector().listen()
    var bot = new builder.UniversalBot(connector);
    server.post('/api/messages', connector.listen());

    //=========================================================
    // Bots Dialogs
    //=========================================================

    bot.dialog('/', function (session) {
        askRegex(session.message.text)
        .then((response) => {
            switch (response.topScoringIntent.intent) {
                case 'createAlert' : {
                    createAlert(session, response);
                }
                break;

                case 'None':
                default : {
                    session.send("Sorry.. didn't understand")
                }
                break;
            }
        });
    });
}

main();
/*askLUIS("updates on microsoft")
.then((result) => {
    console.log(result);
});*/
