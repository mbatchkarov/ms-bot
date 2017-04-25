var nconf = require('nconf');
var request = require('request');
var restify = require('restify');
var builder = require('botbuilder');
var api = require('./api.js');

var config = nconf.env().argv().file({file: 'localConfig.json'});

//=========================================================
// Utility functions
//=========================================================

function _getEntity(entities, session){
    if (!entities.length && session){
        session.send('No entities found in your query!');
        throw Error();
    }
    // TODO: if multiple entities are present decide which one to use- for now the first one            
    var entityName = args[0].entity; 
    return entityName;
}

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

function getThemes() {
    return new Promise((resolve, reject) => {
        // TODO: Likely to expand, perhaps pull from API
        resolve([ "acquisitions", "investment", "partnerships" ]);
    });
}

function titleCase(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
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
        askLUIS(session.message.text)
        .then((response) => {
            switch (response.topScoringIntent.intent) {
                case 'listAlerts':
                    session.beginDialog("/listAlerts");
                    break;
                case 'createAlert':
                    session.beginDialog("/createAlert", response.entities);
                    break;
                case 'deleteAlert':
                    session.beginDialog("/deleteAlert", response.entities);
                    break;
                case 'retrieveAlert':
                    session.beginDialog("/retrieveAlert", response.entities);
                    break;
                case 'getRecentNews':
                    session.beginDialog("/getRecentNews", response.entities);
                    break;
                case 'None':
                default :
                    session.send("Sorry... I didn't understand")
                    break;
            }
        });
    });

    var companyName;

    bot.dialog('/listAlerts', [
        (session, args, next) => {
            api.listAlerts()
                .then(json => {
                    session.send('Available alerts:\n' + JSON.stringify(json));
                    next();
                })
                .catch(err => {
                    session.send('Failed to list alerts');
                    next();
                });
        },
        (session, results) => {
            session.endDialog();
        }

    ]);

    bot.dialog('/createAlert', [
        (session, args, next) => {
            companyName = _getEntity(args, session);
            next();
        },
        (session, args, next) => {
            api.createAlert(companyName, [companyName])
                .then(json => {
                    session.send('Created alert for \"' + json.title + '\"');
                    next();
                })
                .catch(err => {
                    session.send('Failed to create alert for \"' + companyName + '\"');
                    next();
                })
        },
        (session, results) => {
            session.endDialog();
        }
    ]);

    bot.dialog('/deleteAlert', [
        (session, args, next) => {
            companyName = args[0].entity;
            next();
        },
        (session, args, next) => {
            api.listAlerts().then(
                (alerts) => {
                    var selectedAlert = alerts.find((alert) => {
                       return alert.title === companyName
                    });

                    if (selectedAlert === undefined) {
                        session.send('Failed to delete alert for \"' + companyName + '\"');
                        next();
                    } else { 
                        api.deleteAlert(selectedAlert.id)
                            .then(json => {
                                session.send('Deleted alert for \"' + selectedAlert.title + '\"');
                                next();
                            })
                            .catch(err => {
                                session.send('Failed to delete alert for \"' + companyName + '\"');
                                next();
                            })
                    }
                }
            );
        },
        (session, results) => {
            session.endDialog();
        }
    ]);

    bot.dialog('/retrieveAlert', [
        (session, args, next) => {
            companyName = _getEntity;
            next();
        },
        (session, args, next) => {
            api.listAlerts().then(
                (alerts) => {
                    var selectedAlert = alerts.find((alert) => {
                       return alert.title === companyName
                    });

                    if (selectedAlert === undefined) {
                        session.send('Failed to get alert for \"' + companyName + '\"');
                        next();
                    } else { 
                        api.getAlert(selectedAlert.id)
                            .then(json => {
                                session.send('Got alert for \"' + selectedAlert.title + '\":\n' + JSON.stringify(json));
                                next();
                            })
                            .catch(err => {
                                session.send('Failed to get alert for \"' + companyName + '\"');
                                next();
                            })
                    }
                }
           ).catch(err => {
               session.send('Failed to get alert for \"' + companyName + '\"');
               next();
           });
        },
        (session, results) => {
            session.endDialog();
        }
    ]);

    bot.dialog('/getRecentNews', [
        (session, args, next) => {
            companyName = args[0].entity;
            next();
        },
        (session, args, next) => {
            session.send('Working on that...');
            api.getRecentNews(companyName, 3)
                .then(json => {
                    session.send('Recent news for \"' + companyName + '\":\n' + JSON.stringify(json));
                    next();
                })
               .catch(err => {
                    session.send('Failed to get recent news for \"' + companyName + '\"');
                    session.endDialog();
               });
        },
        (session, results) => {
            session.send("Do you want me to turn that into an alert?");
            builder.Prompts.text(session, "?");
        },
        (session, results) => {
            next();
        },
        (session, results) => {
            session.endDialog();
        }
    ]);

    bot.dialog('/getTheme', [
        (session, args, next) => {
            getThemes()
            .then((result) => {
                
                var card = new builder.HeroCard(session)
                .title('BotFramework Hero Card')
                .subtitle('Your bots — wherever your users are talking')
                .text('Choose a theme')
                .images([
                    builder.CardImage.create(session, 'https://sec.ch9.ms/ch9/7ff5/e07cfef0-aa3b-40bb-9baa-7c9ef8ff7ff5/buildreactionbotframework_960.jpg')
                ]);

                var buttons = [];
                buttons = result.map((e) => {
                    return new builder.CardAction.imBack(session, e, titleCase(e));
                });
                card.buttons(buttons);

                var msg = new builder.Message(session).addAttachment(card);
                session.send(msg);
            });
        },
        (session, results) => {
            session.endDialogWithResult({response:results.response});
        }
    ]);
}

main();

/*askLUIS("updates on microsoft")
.then((result) => {
    console.log(result);
});*/
