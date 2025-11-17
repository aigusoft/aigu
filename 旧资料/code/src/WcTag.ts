import { _htmlMeta } from './HtmlMeta';
import { WcLog } from './Logger';
import { _Utils } from './Utils';

const log = WcLog(module);


// 转换包名
export function _kebabPkgName(s:string){
  return s.replace(/-/g,'_').replace('/','-').replace('@','')
}

export function _kebabTag(s: string) {
  return s.replace(/[A-Z][^A-Z]*/g, (m) => '_' + m.toLowerCase()).replace(/^_+/, '');
}

function _fromKebabTag(s: string) {
  // 删除最末尾的"-"
  return s
    .replace(/-+$/, '')
    .replace(/-/g, '/')
    .replace(/_[a-z]/g, (m) => m[1].toUpperCase());
}

export interface ITagInfo {
  from?: string; // 来源包名, 当解析标签时，如果未指定包名, 则使用此包名作引用, 为空则引用到html所在路径
  url: string; // 标签加载的文件路径
  pkg?: string; // 标签包名，如有效，则从指定包名引用
  component: string; // 当前组件路径,"abc/def" 形式
  tag: string; // 当前标签名称
}

export function _parseTag(tag: string, from?: string): ITagInfo {
  let pkg ;
  let ver;
  let component;
  let url;
  // debugger;
    // if (tag.match('pop-')) debugger;

  let sp1 = tag.toLowerCase().split('.');
  if(sp1.length >1){
    // 从tag中获取包名和版本
    pkg = sp1[0].replace(/-/g, '/').replace(/_/g, '-');
    if(pkg.indexOf('/')>=0) pkg = '@'+pkg;
    component =  _fromKebabTag(sp1[1]);
    ver= _htmlMeta.modules[pkg]?.version;

  }else{
    component = _fromKebabTag(tag);
    // 从 from 中获取包名和版本
    if(from){
      let m = from?.match(/^(.*[a-z0-9])@(.+)$/);
      // 检测from中是否有ver
      if(m && m.length == 3){
        pkg = m[1];
        ver = m[2];
      }else{
        pkg=from;
        ver= _htmlMeta.modules[pkg]?.version;
      }
    }
  }
  if(!pkg){
    // 未发现来源包，返回自身标签
    return { from:'',tag, component, pkg: '', url:_htmlMeta.relPath(component, '.html', undefined) };
  }
  let mod = _htmlMeta.modules[pkg];
  if(!mod){
    mod ={name:pkg,files:[],baseUrl:_Utils._joinUrl(_htmlMeta.npmUrl, pkg)};
    _htmlMeta.modules[pkg]=mod;
  }
    // 使用 url 处理
    url = _Utils._joinUrl(mod.baseUrl, component + '.html')
  // if (ver) tagPkg = `${tagPkg}@${ver}`;

  let tagPkg = ver? `${pkg}@${ver}`:pkg;

  return { from: tagPkg, component, tag, pkg, url };

}

//   if (sp1.length > 1) {
//     let component = _fromKebabEx(sp1[1]);
//     // 含有包名
//     let pkg = sp1[0].replace(/-/g, '/').replace(/_/g, '-');
//     if (pkg.lastIndexOf('/') > 0) pkg = '@' + pkg;

//     // 检查和拼接版本号
//     let ver = _htmlMeta.modules[pkg]?.version;
//     let forceUrl = _htmlMeta.modules[pkg]?.url;
//     if (forceUrl) {
//       if (!forceUrl?.match(/^https?:\/\//)) forceUrl = location.origin + forceUrl;
//     }

//     if (ver) pkg = `${pkg}@${ver}`;

//     let url = forceUrl
//       ? _Utils._joinUrl(forceUrl, component + '.html')
//       : _Utils._joinUrl(_htmlMeta.npmUrl, pkg, component + '.html');
//     // 开发模式标签解析
//     if (devConfig && devConfig[pkg]) {
//       url = _Utils._joinUrl(devConfig[pkg], component + '.html');
//       log.warn('use dev component:', pkg, url);
//     }

//     return { from: pkg, component, tag, pkg, url };
//   } else {
//     // 不包含包名, 从from 或者 html location中获取路径
//     // if (sp1[0].endsWith('main')) debugger;
//     let component = _fromKebabEx(sp1[0]);
//     let url = _htmlMeta.relPath(component, '.html', from);
//     // 开发模式标签解析
//     if (devConfig) {
//       if (!from && devConfig['.']) {
//         url = _Utils._joinUrl(devConfig['.'], component + '.html');
//         log.warn('use dev component:', url);
//       }
//       if (from && devConfig[from]) {
//         url = _Utils._joinUrl(devConfig[from], component + '.html');
//         log.warn('use dev component:', url);
//       }
//     }

//     return { from, tag, component, url };
//   }
// }

export function _buildTag(pkg: string | undefined, component: string): string {
  // 包名转换规则:
  // abc-def -> abc_def
  // 1. @abc/pkg -> abc-pkg
  // 2. @abc-def/pkg -> abc_def-pkg
  // 3. @abc/def-pkg -> abc-def_pkg
  // 4. @abc-def/efg-pkg -> abc_def-efg_pkg

  // 组件名转换规则
  // 1. abc ->abc-
  // 2. abcComp -> abc_comp-
  // 3. abc/def -> abc-def
  // 4. abcDef/comp ->abc_def-comp

  // 组件名转换规则
  let pkgPart='';
  if(pkg){
    pkgPart= pkg.replace(/-/g,'_').replace('/','-').replace('@','')
  }
  // debugger;

  // 如果生成的TAG中不包含'-'则在最后添加'-'
  // 包名中转换规则
  // let pkgPart = pkg ? pkg.replace(/-/g, '_').replace(/[\\/]/g, '-').replace('@', '') : '';
  let c = _kebabTag(component)
  let tag = (pkgPart ? pkgPart + '.' + c : c).replace(/[\\/]/g, '-');
  return tag.indexOf('-') < 0 ? tag + '-' : tag;
}
