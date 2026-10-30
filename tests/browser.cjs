const {chromium:engine}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
exports.chromium={launch(options={}){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if(executablePath){
    const {channel,...rest}=options;
    return engine.launch({...rest,executablePath});
  }
  return engine.launch(options);
}};
