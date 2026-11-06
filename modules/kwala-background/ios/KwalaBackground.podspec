Pod::Spec.new do |s|
  s.name           = 'KwalaBackground'
  s.version        = '1.0.0'
  s.summary        = 'Keeps a streaming chat answer alive for the time iOS allows after the app leaves the foreground.'
  s.description    = s.summary
  s.author         = 'Kwala Intel'
  s.homepage       = 'https://kwalaintel.com'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.{h,m,swift}'
end
