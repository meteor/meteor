#!/bin/bash
cd $METEOR_HOME/examples;
read -p "Prefix? " PREFIX;
for EXAMPLE in leaderboard todos wordplay parties
do
    cd $EXAMPLE;
    echo "meteor deploy $@ $PREFIX-$EXAMPLE;"
    meteor deploy $@ $PREFIX-$EXAMPLE;
    cd ..;
done
