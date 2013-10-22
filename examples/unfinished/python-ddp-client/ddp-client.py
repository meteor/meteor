#!/usr/bin/env python2.7

import sys
import json
import time
import argparse
import thread
import threading
import traceback

from ws4py.client.threadedclient import WebSocketClient
from cmd import Cmd


DDP_VERSIONS = ["pre1"]

def log(msg):
    """A shortcut to write to the standard error file descriptor"""
    sys.stderr.write('{}\n'.format(msg))


def parse_command(params):
    """Parses a command with a first string param and a second
    json-encoded param"""
    name, args = (params + ' ').split(' ', 1)
    return name, args and json.loads(args) or []


class DDPClient(WebSocketClient):
    """simple wrapper around Websockets for DDP connections"""
    def __init__(self, url, print_raw):
        WebSocketClient.__init__(self, url)
        self.print_raw = print_raw

        # We keep track of methods and subs that have been sent from the
        # client so that we only return to the prompt or quit the app
        # once we get back all the results from the server.
        #
        # `id`
        #
        #   The operation id, informed by the client and returned by the
        #   server to make sure both are talking about the same thing.
        #
        # `result_acked`
        #
        #   Flag to make sure we were answered.
        #
        # `data_acked`
        #
        #   Flag to make sure we received the correct data from the
        #   message we were waiting for.
        self.pending_condition = threading.Condition()
        self.pending = {}


    def send(self, msg_dict):
        """Send a message through the websocket client and wait for the
        answer if the message being sent contains an id attribute.

        Also prints to the standard error fd.

        (NOTE: DDP does not require waiting for an answer but this is
        a simple proof-of-concept client)"""
        message = json.dumps(msg_dict)
        if self.print_raw:
            log('[RAW] >> {}'.format(message))
        super(DDPClient, self).send(message)

        # We don't need to wait for certain messages, just for the ones
        # with ids.
        if 'id' in msg_dict:
            self.block_until_return(msg_dict['msg'], msg_dict['id'])

    def block_until_return(self, msg_type, msg_id):
        """Wait until the msg_id that was sent to the server is answered"""
        with self.pending_condition:
            self.pending = {'id': msg_id}

            while self.pending.get('id') is not None:
                if msg_type == 'method':
                    # Methods must validate both data and result flag
                    we_are_good = all((
                            self.pending.get('result_acked'),
                            self.pending.get('data_acked')))
                else:
                    # Subs just need to validate data flag
                    we_are_good = self.pending.get('data_acked')

                if we_are_good:
                    return
                self.pending_condition.wait()

    def opened(self):
        """Set the connecte flag to true and send the connect message to
        the server."""
        self.send({"msg": "connect", "version": DDP_VERSIONS[0],
                   "support": DDP_VERSIONS})

    def received_message(self, data):
        """Parse an incoming message and print it. Also update
        self.pending appropriately"""
        if self.print_raw:
            log('[RAW] << {}'.format(data))

        msg = json.loads(str(data))

        changed_pending = False

        with self.pending_condition:
            if msg.get('msg') == 'error':
                log("* ERROR {}".format(msg['reason']))
                # Reset all pending state
                self.pending = {}
                changed_pending = True

            elif msg.get('msg') == 'connected':
                log("* CONNECTED")

            elif msg.get('msg') == 'failed':
                log("* FAILED; suggested version {}".format(msg['version']))

            elif msg.get('msg') == 'result':
                if msg['id'] == self.pending.get('id'):
                    if msg.get('result'):
                        log("* METHOD RESULT {}".format(msg['result']))
                    elif msg.get('error'):
                        log("* ERROR {}".format(msg['error']['reason']))
                    else:
                        log("* METHOD FINISHED")
                    self.pending.update({'result_acked': True})
                    changed_pending = True

            elif msg.get('msg') == 'added':
                log("* ADDED {} {}".format(
                        msg['collection'], msg['id']))
                if 'fields' in msg:
                    for key, value in msg['fields'].items():
                        log("  - FIELD {} {}".format(key, value))
            elif msg.get('msg') == 'changed':
                log("* CHANGED {} {}".format(
                        msg['collection'], msg['id']))
                if 'fields' in msg:
                    for key, value in msg['fields'].items():
                        log("  - FIELD {} {}".format(key, value))
                if 'cleared' in msg:
                    for key in msg['cleared']:
                        log("  - CLEARED {}".format(key));
            elif msg.get('msg') == 'removed':
                log("* REMOVED {} {}".format(
                        msg['collection'], ", ".join(msg['ids'])))
            elif msg.get('msg') == 'ready':
                assert 'subs' in msg
                if self.pending.get('id') in msg['subs']:
                    log("* READY")
                    self.pending.update({'data_acked': True})
                    changed_pending = True
            elif msg.get('msg') == 'updated':
                if self.pending.get('id') in msg['methods']:
                    log("* UPDATED")
                    self.pending.update({'data_acked': True})
                    changed_pending = True
            elif msg.get('msg') == 'nosub':
                log("* NOSUB")
                self.pending.update({'data_acked': True})
                changed_pending = True

            if changed_pending:
                self.pending_condition.notify()

    def closed(self, code, reason=None):
        """Called when the connection is closed"""
        log('* CONNECTION CLOSED {} {}'.format(code, reason))

    # Overrides WebSocket to run to ensure that if an unhandled exception is
    # thrown in the thread, we print the exception and *then* kill the main
    # thread.
    def run(self):
        try:
            super(DDPClient, self).run()
        except:
            traceback.print_exc()
        finally:
            with self.pending_condition:
                self.pending_condition.notify()
            thread.interrupt_main()


class App(Cmd):
    """Main input loop."""

    def __init__(self, ddp_endpoint, print_raw):
        Cmd.__init__(self)

        # Should we print the raw websocket messages in addition to
        # parsing them?
        self.print_raw = print_raw

        # This is the websocket client that will actually talk with
        # meteor
        self.ddpclient = DDPClient(
            'ws://' + ddp_endpoint + '/websocket',
            self.print_raw)
        self.ddpclient.connect()

        # Showing a fancy prompt string if we're interactive
        if sys.stdin.isatty():
            self.prompt = ddp_endpoint + '> '
        else:
            self.prompt = ''

        # Initializing the message id counter that will be incremented
        # by the `next_id() method
        self.unique_id = 0

    def do_call(self, params):
        """The `call` command"""
        try:
            method_name, params = parse_command(params)
        except ValueError:
            log('Error parsing parameter list - try `help call`')
            return
        self.ddpclient.send({
            "msg": "method",
            "method": method_name,
            "params": params,
            "id": self.next_id(),
        })

    def do_sub(self, params):
        """The `sub` command"""
        try:
            sub_name, params = parse_command(params)
        except ValueError:
            log('Error parsing parameter list - try `help sub`')
            return
        self.ddpclient.send({
            "msg": "sub",
            "name": sub_name,
            "params": params,
            "id": self.next_id(),
        })

    def do_EOF(self, line):
        """The `EOF` "command"

        It's here to support `cat file | python ddpclient.py`
        """
        return True

    def do_help(self, line):
        """The `help` command"""

        msgs = {
            'call': (
                'call <method name> <json array of parameters>\n'
                '  Calls a remote method\n'
                '  Example: call vote ["foo.meteor.com"]'),
            'sub': (
                'sub <subscription name> [<json array of parameters>]\n'
                '  Subscribes to a remote dataset\n'
                '  Examples: `sub allApps` or `sub myApp '
                '["foo.meteor.com"]`'),
        }

        line = line.strip()
        if line and line in msgs:
            return log('\n' + msgs[line])

        for msg in msgs.values():
            log('\n' + msg)

    def emptyline(self):
        """Disable the default Cmd empty line behavior"""
        pass

    def next_id(self):
        """Calculates the next id for messages that will be sent to the
        server"""
        self.unique_id = self.unique_id + 1
        return str(self.unique_id)


def main():
    """Parse the command line arguments and create a new App instance"""
    parser = argparse.ArgumentParser(
        description='A command-line tool for communicating with a DDP server.')
    parser.add_argument(
        'ddp_endpoint', metavar='ddp_endpoint',
        help='DDP websocket endpoint to connect ' +
        'to, e.g. madewith.meteor.com')
    parser.add_argument(
        '--print-raw', dest='print_raw', action="store_true",
        help='print raw websocket data in addition to parsed results')
    args = parser.parse_args()

    app = App(args.ddp_endpoint, args.print_raw)
    try:
        app.cmdloop()
    except KeyboardInterrupt:
        # On Ctrl-C or thread.interrupt_main(), just exit without printing a
        # traceback.
        pass


if __name__ == '__main__':
    main()
