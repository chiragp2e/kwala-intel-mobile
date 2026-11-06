Pod::Spec.new do |s|
  s.name           = 'KwalaGoogle'
  s.version        = '1.0.0'
  s.summary        = 'Google sign-in on iOS with a caller-chosen nonce, so Supabase can check the ID token.'
  s.description    = s.summary
  s.author         = 'Kwala Intel'
  s.homepage       = 'https://kwalaintel.com'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # The version is pinned by @react-native-google-signin/google-signin, which configures the shared instance.
  s.dependency 'GoogleSignIn'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.{h,m,swift}'
end
