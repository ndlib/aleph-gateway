#!/bin/bash
green=`tput setaf 2`
blue=`tput setaf 4`
magenta=`tput setaf 5`
reset=`tput sgr0`

echo "${magenta}----- POST-BUILD -----${reset}"

# add sentry deploy if build was a success
if [ ${LOCAL_DEPLOY:=false} = true ] || [ ${CODEBUILD_BUILD_SUCCEEDING:=0} = 1 ]
then
  yarn sentry-cli releases deploys aleph-gateway@$VERSION new -e $STAGE || { echo "Failed to create sentry deployment."; exit 1; }

  # finalize the release only if stage is prod
  if [ $STAGE = "prod" ]
  then
    yarn sentry-cli releases finalize aleph-gateway@$VERSION || { echo "Failed to finalize sentry release."; exit 1; }
  fi
fi

echo -e "${green}\nDeployment completed successfully.\n${reset}"